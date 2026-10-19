// Read-only, bounded local metadata reader. No prompts, authentication tokens,
// tool output, task names or rollout paths leave this process.
#import <Foundation/Foundation.h>
#include <stdio.h>
#include <math.h>

static BOOL number(id x) { return [x isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)x)!=CFBooleanGetTypeID() && isfinite([x doubleValue]); }
static double stamp(id x) {
    if (![x isKindOfClass:NSString.class]) return 0;
    static NSISO8601DateFormatter *fraction, *plain;
    if (!fraction) { fraction=[NSISO8601DateFormatter new]; fraction.formatOptions=NSISO8601DateFormatWithInternetDateTime|NSISO8601DateFormatWithFractionalSeconds; plain=[NSISO8601DateFormatter new]; }
    return ([fraction dateFromString:x] ?: [plain dateFromString:x]).timeIntervalSince1970;
}
static NSArray *counts(id x) {
    if (![x isKindOfClass:NSDictionary.class]) return nil;
    id input=x[@"input_tokens"], cached=x[@"cached_input_tokens"], output=x[@"output_tokens"];
    if (!number(input)||!number(cached)||!number(output)) return nil;
    if ([input doubleValue]<0||[cached doubleValue]<0||[cached doubleValue]>[input doubleValue]||[output doubleValue]<0 || [input doubleValue]+[output doubleValue]>1e12) return nil;
    for(id value in @[input,cached,output])if(floor([value doubleValue])!=[value doubleValue])return nil;
    return @[input,cached,output]; // reasoning is a subset of output, not added again
}
static NSMutableArray *zero(void) { return [@[@0,@0,@0] mutableCopy]; }
static void add(NSMutableArray *a, NSArray *b) { for (int i=0;i<3;i++) a[i]=@([a[i] doubleValue]+[b[i] doubleValue]); }

static BOOL writeCache(NSData *data,NSString *root,NSString *account,NSString *name) {
    NSFileManager *fm=NSFileManager.defaultManager;
    NSDictionary *current=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[root stringByAppendingPathComponent:@"auth.json"]]?:[NSData data] options:0 error:nil];
    if (![current isKindOfClass:NSDictionary.class]||![current[@"auth_mode"] isEqual:@"chatgpt"]||
        ![current[@"tokens"] isKindOfClass:NSDictionary.class]||![current[@"tokens"][@"account_id"] isEqual:account]) return NO;
    NSString *folder=[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/CodexUsageMeter/Cache"];
    NSString *cache=[folder stringByAppendingPathComponent:name];
    NSDictionary *attributes=@{NSFilePosixPermissions:@0700};
    if ([[fm attributesOfItemAtPath:folder error:nil][NSFileType] isEqual:NSFileTypeSymbolicLink]) return NO;
    if (![fm createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:attributes error:nil]||![fm setAttributes:attributes ofItemAtPath:folder error:nil]) return NO;
    if ([[fm attributesOfItemAtPath:cache error:nil][NSFileType] isEqual:NSFileTypeSymbolicLink]) return NO;
    return [data writeToFile:cache options:NSDataWritingAtomic error:nil]&&[fm setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:cache error:nil];
}
int main(int argc, const char *argv[]) { @autoreleasepool {
    // Optional root/cutoff are for deterministic tests and walk-forward replay.
    NSString *root=argc>1 ? [NSString stringWithUTF8String:argv[1]] : NSProcessInfo.processInfo.environment[@"CODEX_HOME"];
    if (!root.length) root=[NSHomeDirectory() stringByAppendingPathComponent:@".codex"];
    double now=argc>2 ? atof(argv[2]) : NSDate.date.timeIntervalSince1970;
    if (!isfinite(now)||now<=0) return 2;
    NSData *authData=[NSData dataWithContentsOfFile:[root stringByAppendingPathComponent:@"auth.json"]];
    NSDictionary *auth=authData.length<=65536 ? [NSJSONSerialization JSONObjectWithData:authData?:[NSData data] options:0 error:nil] : nil;
    id account=[auth isKindOfClass:NSDictionary.class]&&[auth[@"tokens"] isKindOfClass:NSDictionary.class] ? auth[@"tokens"][@"account_id"] : nil;
    if (![auth isKindOfClass:NSDictionary.class]||![auth[@"auth_mode"] isEqual:@"chatgpt"]||![account isKindOfClass:NSString.class]||![account length]||[account length]>256) return 3;
    NSMutableArray *events=[NSMutableArray new]; NSMutableSet *seen=[NSMutableSet new];
    NSFileManager *fm=NSFileManager.defaultManager;
    double started=NSDate.date.timeIntervalSince1970, oldest=floor((now-21*86400)/86400)*86400;
    unsigned long long bytes=0; NSUInteger files=0; __block BOOL incomplete=NO;
    for (NSString *folder in @[@"sessions",@"archived_sessions"]) {
        NSURL *base=[NSURL fileURLWithPath:[root stringByAppendingPathComponent:folder]];
        if (![fm fileExistsAtPath:base.path]) continue;
        NSDirectoryEnumerator *enumerator=[fm enumeratorAtURL:base includingPropertiesForKeys:@[NSURLIsSymbolicLinkKey,NSURLContentModificationDateKey] options:NSDirectoryEnumerationSkipsHiddenFiles errorHandler:^BOOL(NSURL *url,NSError *error){ (void)url;(void)error; incomplete=YES;return YES; }];
        for (NSURL *url in enumerator) {
            NSNumber *link=nil; [url getResourceValue:&link forKey:NSURLIsSymbolicLinkKey error:nil];
            if (link.boolValue) { [enumerator skipDescendants]; continue; }
            if (![url.lastPathComponent hasPrefix:@"rollout-"]||![url.pathExtension isEqual:@"jsonl"]) continue;
            NSDate *modified=nil; [url getResourceValue:&modified forKey:NSURLContentModificationDateKey error:nil];
            if (!modified||modified.timeIntervalSince1970<oldest) continue;
            if (++files>1500||bytes>8ULL*1024*1024*1024||NSDate.date.timeIntervalSince1970-started>25) { incomplete=YES; break; }
            FILE *file=fopen(url.fileSystemRepresentation,"r"); if (!file) { incomplete=YES;continue; }
            BOOL matched=NO, haveBase=NO; NSString *session=@"", *turn=@"", *model=@""; NSArray *previous=nil;
            char chunk[8192]; NSMutableData *line=[NSMutableData new]; BOOL oversized=NO, firstChunk=YES, wanted=NO;
            while (fgets(chunk,sizeof(chunk),file)) { @autoreleasepool {
                size_t length=strlen(chunk); bytes+=length;
                if (bytes>8ULL*1024*1024*1024||events.count>150000||NSDate.date.timeIntervalSince1970-started>25) { incomplete=YES; break; }
                if (firstChunk) { wanted=strstr(chunk,"\"session_meta\"")||strstr(chunk,"\"turn_context\"")||strstr(chunk,"\"token_count\"");firstChunk=NO; }
                if (wanted&&!oversized) { if (line.length+length>1024*1024) { oversized=YES;line.length=0; } else [line appendBytes:chunk length:length]; }
                if (!length||(chunk[length-1]!='\n'&&!feof(file))) continue;
                firstChunk=YES;
                if (oversized) { oversized=NO; continue; }
                if (!wanted) continue;
                NSString *s=[[NSString alloc] initWithData:line encoding:NSUTF8StringEncoding]; line.length=0;
                if (![s containsString:@"\"session_meta\""]&&![s containsString:@"\"turn_context\""]&&![s containsString:@"\"token_count\""]) continue;
                NSDictionary *entry=[NSJSONSerialization JSONObjectWithData:[s dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
                if (![entry isKindOfClass:NSDictionary.class]||![entry[@"payload"] isKindOfClass:NSDictionary.class]) continue;
                NSDictionary *p=entry[@"payload"]; NSString *type=entry[@"type"];
                if ([type isEqual:@"session_meta"]) {
                    matched=[p[@"creator_account_id"] isEqual:account];
                    session=[p[@"id"] isKindOfClass:NSString.class]?p[@"id"]:@"";
                    turn=@"";model=@"";previous=nil;haveBase=NO;continue;
                }
                if (!matched) continue;
                if ([type isEqual:@"turn_context"]) {
                    turn=[p[@"turn_id"] isKindOfClass:NSString.class]?p[@"turn_id"]:@"";
                    model=[p[@"model"] isKindOfClass:NSString.class]?p[@"model"]:@"";continue;
                }
                if (![type isEqual:@"event_msg"]||![p[@"type"] isEqual:@"token_count"]||![p[@"info"] isKindOfClass:NSDictionary.class]) continue;
                double at=stamp(entry[@"timestamp"]); if (!at||at>now) continue;
                NSArray *total=counts(p[@"info"][@"total_token_usage"]), *last=counts(p[@"info"][@"last_token_usage"]);
                if (!total) continue;
                NSMutableArray *delta=zero(); BOOL monotone=haveBase;
                for (int i=0;i<3&&haveBase;i++) if ([total[i] doubleValue]<[previous[i] doubleValue]) monotone=NO;
                if (monotone) { for (int i=0;i<3;i++) delta[i]=@([total[i] doubleValue]-[previous[i] doubleValue]); }
                // First event/fork may contain inherited totals: only its last call
                // can contribute. It is globally deduplicated by execution turn.
                else if (last) delta=[last mutableCopy];
                previous=total;haveBase=YES;
                if (at<oldest||![model hasPrefix:@"gpt-"]||!session.length) continue;
                NSString *key=[NSString stringWithFormat:@"%@|%@|%@",turn.length?turn:session,model,[total componentsJoinedByString:@","]];
                if ([seen containsObject:key]) delta=zero(); else [seen addObject:key];
                if ([delta[1] doubleValue]>[delta[0] doubleValue]) delta[1]=delta[0];
                id rates=p[@"rate_limits"]; NSDictionary *window=nil; NSString *plan=@"";
                if ([rates isKindOfClass:NSDictionary.class]&&[rates[@"limit_id"] isEqual:@"codex"]&&[rates[@"plan_type"] isKindOfClass:NSString.class]) {
                    plan=rates[@"plan_type"];
                    for (NSString *name in @[@"primary",@"secondary"]) {
                        id w=rates[name];
                        if ([w isKindOfClass:NSDictionary.class]&&number(w[@"window_minutes"])&&[w[@"window_minutes"] intValue]==10080&&number(w[@"used_percent"])&&number(w[@"resets_at"])&&[w[@"used_percent"] doubleValue]>=0&&[w[@"used_percent"] doubleValue]<=100&&[w[@"resets_at"] doubleValue]>at) window=w;
                    }
                }
                NSMutableDictionary *event=[@{@"at":@(at),@"counts":delta,@"model":model} mutableCopy];
                if (window) {event[@"used"]=window[@"used_percent"];event[@"resetAt"]=window[@"resets_at"];event[@"plan"]=plan;}
                [events addObject:event];
            }}
            fclose(file); if (incomplete&&(bytes>8ULL*1024*1024*1024||files>1500||events.count>150000||NSDate.date.timeIntervalSince1970-started>25)) break;
        }
    }
    [events sortUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){return [a[@"at"] compare:b[@"at"]];}];
    NSMutableArray *anchors=[NSMutableArray new], *prefix=zero(); NSMutableDictionary *models=[NSMutableDictionary new], *days=[NSMutableDictionary new];
    NSDictionary *lastQuota=nil; NSInteger segment=0; double planSince=0; NSString *lastPlan=@"";
    for (NSDictionary *e in events) {
        add(prefix,e[@"counts"]); double tokens=[e[@"counts"][0] doubleValue]+[e[@"counts"][2] doubleValue];
        NSString *model=e[@"model"]; models[model]=@([models[model] doubleValue]+tokens);
        double at=[e[@"at"] doubleValue], day=floor(at/86400)*86400;
        NSString *dayKey=[NSString stringWithFormat:@"%.0f",day]; NSMutableDictionary *d=days[dayKey];
        if (!d) {d=[@{@"at":@(day),@"counts":zero(),@"models":[NSMutableDictionary new]} mutableCopy];days[dayKey]=d;}
        add(d[@"counts"],e[@"counts"]); NSMutableDictionary *dm=d[@"models"];dm[model]=@([dm[model] doubleValue]+tokens);
        if (!e[@"plan"]) continue;
        if (![lastPlan isEqual:e[@"plan"]]) { lastPlan=e[@"plan"];planSince=at; }
        BOOL boundary=!lastQuota||![lastQuota[@"plan"] isEqual:e[@"plan"]]||fabs([lastQuota[@"resetAt"] doubleValue]-[e[@"resetAt"] doubleValue])>600||[e[@"used"] doubleValue]<[lastQuota[@"used"] doubleValue]-3;
        if (boundary) segment++;
        NSDictionary *a=@{@"at":@(at),@"used":e[@"used"],@"resetAt":e[@"resetAt"],@"plan":e[@"plan"],@"segment":@(segment),@"planSince":@(planSince),@"counts":[prefix copy],@"models":[models copy]};
        NSDictionary *tail=anchors.lastObject;
        // Preserve every reset/refill boundary, even inside a six-hour bucket.
        if (tail&&[tail[@"segment"] isEqual:a[@"segment"]]&&floor([tail[@"at"] doubleValue]/21600)==floor(at/21600)) anchors[anchors.count-1]=a;
        else [anchors addObject:a];
        lastQuota=e;
    }
    // Fail closed on bounded/truncated scans; never present partial totals as
    // complete. stdout is bounded to avoid blocking a waiting NSTask pipe.
    if (incomplete||anchors.count>240||days.count>23) {
        fprintf(stderr,"token-history: scan incomplete (files=%lu events=%lu anchors=%lu days=%lu bytes=%llu)\n",(unsigned long)files,(unsigned long)events.count,(unsigned long)anchors.count,(unsigned long)days.count,bytes);
        return 4;
    }
    NSArray *daily=[[days allValues] sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){return [a[@"at"] compare:b[@"at"]];}];
    NSDictionary *result=@{@"version":@1,@"accountId":account,@"savedAt":@(now),@"anchors":anchors,@"days":daily};
    NSData *data=[NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    if (!data||data.length>48000) return 5;
    if (argc>3 && strcmp(argv[3],"--cache")==0) {
        // Avoid NSTask pipe backpressure. Only a fixed app-owned private cache
        // is writable; callers cannot choose an arbitrary destination.
        if(!writeCache(data,root,account,@"token-history.json"))return 6;
        fputs("ok\n",stdout);return 0;
    }
    fwrite(data.bytes,1,data.length,stdout);return 0;
}}
