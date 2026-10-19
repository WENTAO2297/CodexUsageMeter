// Read-only profile activity, using the same endpoint/date buckets as Profile.
// Credentials and the profile response never leave this bounded native process.
#import <Foundation/Foundation.h>
#include <math.h>
#include <stdio.h>

static const NSUInteger ProfileLimit = 512 * 1024;
static NSString *const ProfileEndpoint = @"https://chatgpt.com/backend-api/wham/profiles/me";
static BOOL ProfileInteger(id value) {
    return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value)!=CFBooleanGetTypeID() &&
        isfinite([value doubleValue]) && [value doubleValue]>=0 && floor([value doubleValue])==[value doubleValue] &&
        [value doubleValue]<=9007199254740991.0;
}
static BOOL ProfileString(id value, NSUInteger limit) {
    return [value isKindOfClass:NSString.class] && [value length]>0 && [value length]<=limit &&
        [value rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location==NSNotFound;
}
static NSDictionary *ProfileAuth(NSString *root) {
    NSString *file=[root stringByAppendingPathComponent:@"auth.json"];
    NSNumber *size=[NSFileManager.defaultManager attributesOfItemAtPath:file error:nil][NSFileSize];
    if (!size || size.unsignedLongLongValue>65536) return nil;
    NSData *data=[NSData dataWithContentsOfFile:file];
    if (!data || data.length>65536) return nil;
    id auth=data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![auth isKindOfClass:NSDictionary.class] || ![auth[@"auth_mode"] isEqual:@"chatgpt"] ||
        ![auth[@"tokens"] isKindOfClass:NSDictionary.class]) return nil;
    id tokens=auth[@"tokens"];
    if (!ProfileString(tokens[@"account_id"],256) || !ProfileString(tokens[@"access_token"],16384)) return nil;
    return @{@"account":tokens[@"account_id"],@"access":tokens[@"access_token"]};
}
static NSDateFormatter *ProfileDateFormatter(void) {
    NSDateFormatter *format=[NSDateFormatter new];
    format.locale=[[NSLocale alloc] initWithLocaleIdentifier:@"en_US_POSIX"];
    format.calendar=[[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];
    format.timeZone=[NSTimeZone timeZoneForSecondsFromGMT:0];format.dateFormat=@"yyyy-MM-dd";format.lenient=NO;
    return format;
}
static NSDictionary *ProfileSummary(id reply, NSString *account, double now, NSTimeZone *zone) {
    if (![reply isKindOfClass:NSDictionary.class] || !ProfileString(account,256) || !isfinite(now) || now<=0) return nil;
    id stats=reply[@"stats"],metadata=reply[@"metadata"];
    if (![stats isKindOfClass:NSDictionary.class] || ![metadata isKindOfClass:NSDictionary.class]) return nil;
    id error=metadata[@"stats_error"];
    if (error && error!=NSNull.null && (![error isKindOfClass:NSString.class] ||
        [[error stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] length])) return nil;
    id buckets=stats[@"daily_usage_buckets"];
    if (![buckets isKindOfClass:NSArray.class] || [buckets count]>4000) return nil;
    NSDateFormatter *format=ProfileDateFormatter();NSMutableDictionary *counts=[NSMutableDictionary new];
    for (id bucket in buckets) {
        if (![bucket isKindOfClass:NSDictionary.class]) return nil;
        id date=bucket[@"start_date"],tokens=bucket[@"tokens"];
        NSDate *parsed=[date isKindOfClass:NSString.class] && [date length]==10 ? [format dateFromString:date] : nil;
        if (!parsed || ![[format stringFromDate:parsed] isEqual:date] || !ProfileInteger(tokens)) return nil;
        double sum=[counts[date] doubleValue]+[tokens doubleValue];
        if (sum>9007199254740991.0) return nil;
        counts[date]=@(sum); // Profile's graph also sums repeated date buckets.
    }
    NSCalendar *calendar=[[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];calendar.timeZone=zone;
    NSDate *today=[calendar startOfDayForDate:[NSDate dateWithTimeIntervalSince1970:now]];
    // Preserve the server's date strings. Only choose today's label in the
    // user's calendar; never reinterpret server days as UTC event timestamps.
    NSDateComponents *parts=[calendar components:NSCalendarUnitYear|NSCalendarUnitMonth|NSCalendarUnitDay fromDate:today];
    NSCalendar *utc=format.calendar;utc.timeZone=format.timeZone;
    NSDate *day=[utc dateFromComponents:parts];NSMutableArray *days=[NSMutableArray new];double total=0;
    for (NSInteger offset=-29;offset<=0;offset++) {
        NSString *date=[format stringFromDate:[utc dateByAddingUnit:NSCalendarUnitDay value:offset toDate:day options:0]];
        NSNumber *tokens=counts[date] ?: @0;total+=tokens.doubleValue;
        if (total>9007199254740991.0) return nil;
        [days addObject:@{@"date":date,@"tokens":tokens}];
    }
    return @{@"version":@3,@"source":@"profile",@"accountId":account,@"savedAt":@(now),@"days":days};
}

@interface ProfileTransport : NSObject <NSURLSessionDataDelegate>
@property(nonatomic) NSMutableData *data;
@property(nonatomic) NSInteger status;
@property(nonatomic) BOOL failed;
@property(nonatomic) dispatch_semaphore_t done;
@end
@implementation ProfileTransport
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response
        newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))handler {
    (void)session;(void)task;(void)response;(void)request;self.failed=YES;handler(nil);
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveResponse:(NSURLResponse *)response
        completionHandler:(void (^)(NSURLSessionResponseDisposition))handler {
    (void)session;(void)task;self.status=[(NSHTTPURLResponse *)response statusCode];
    if (response.expectedContentLength>(long long)ProfileLimit) {self.failed=YES;handler(NSURLSessionResponseCancel);}
    else handler(NSURLSessionResponseAllow);
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
    (void)session;
    if (self.data.length+data.length>ProfileLimit) {self.failed=YES;[task cancel];return;}
    [self.data appendData:data];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    (void)session;(void)task;if (error) self.failed=YES;dispatch_semaphore_signal(self.done);
}
@end
static BOOL ProfileWriteCache(NSData *data, NSString *root, NSString *account) {
    if (![ProfileAuth(root)[@"account"] isEqual:account]) return NO;
    NSFileManager *fm=NSFileManager.defaultManager;
    NSString *folder=[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/CodexUsageMeter/Cache"];
    NSString *file=[folder stringByAppendingPathComponent:@"token-profile.json"];
    if ([[fm attributesOfItemAtPath:folder error:nil][NSFileType] isEqual:NSFileTypeSymbolicLink] ||
        [[fm attributesOfItemAtPath:file error:nil][NSFileType] isEqual:NSFileTypeSymbolicLink]) return NO;
    NSDictionary *permissions=@{NSFilePosixPermissions:@0700};
    return [fm createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:permissions error:nil] &&
        [fm setAttributes:permissions ofItemAtPath:folder error:nil] && [data writeToFile:file options:NSDataWritingAtomic error:nil] &&
        [fm setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:file error:nil];
}
int main(int argc,const char *argv[]) { @autoreleasepool {
    NSString *root=argc>1 ? [NSString stringWithUTF8String:argv[1]] : NSProcessInfo.processInfo.environment[@"CODEX_HOME"];
    if (!root.length) root=[NSHomeDirectory() stringByAppendingPathComponent:@".codex"];
    double now=argc>2 ? atof(argv[2]) : NSDate.date.timeIntervalSince1970;
    NSDictionary *auth=ProfileAuth(root);if (!auth) return 3;
    ProfileTransport *transport=[ProfileTransport new];transport.data=[NSMutableData new];transport.done=dispatch_semaphore_create(0);
    NSURLSessionConfiguration *config=NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.URLCache=nil;config.HTTPCookieStorage=nil;config.HTTPShouldSetCookies=NO;
    config.timeoutIntervalForRequest=12;config.timeoutIntervalForResource=18;
    config.TLSMinimumSupportedProtocolVersion=tls_protocol_version_TLSv12;
    NSOperationQueue *queue=[NSOperationQueue new];queue.maxConcurrentOperationCount=1;
    NSURLSession *session=[NSURLSession sessionWithConfiguration:config delegate:transport delegateQueue:queue];
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:ProfileEndpoint]];
    request.HTTPMethod=@"GET";[request setValue:@"application/json" forHTTPHeaderField:@"Accept"];
    [request setValue:[@"Bearer " stringByAppendingString:auth[@"access"]] forHTTPHeaderField:@"Authorization"];
    [request setValue:auth[@"account"] forHTTPHeaderField:@"ChatGPT-Account-ID"];
    NSURLSessionDataTask *task=[session dataTaskWithRequest:request];[task resume];
    BOOL timedOut=dispatch_semaphore_wait(transport.done,dispatch_time(DISPATCH_TIME_NOW,22*NSEC_PER_SEC))!=0;
    [session invalidateAndCancel];
    if (timedOut || transport.failed) return 5;
    if (transport.status==401 || transport.status==403) return 3;
    if (transport.status==429) return 4;
    if (transport.status!=200) return 5;
    id reply=[NSJSONSerialization JSONObjectWithData:transport.data options:0 error:nil];
    NSDictionary *summary=ProfileSummary(reply,auth[@"account"],now,NSTimeZone.localTimeZone);
    if (!summary || ![ProfileAuth(root)[@"account"] isEqual:auth[@"account"]]) return 5;
    NSData *data=[NSJSONSerialization dataWithJSONObject:summary options:0 error:nil];
    if (!data || data.length>64000) return 5;
    if (argc>3 && strcmp(argv[3],"--cache")==0) {
        if (!ProfileWriteCache(data,root,auth[@"account"])) return 5;
        fputs("ok\n",stdout);
    } else fwrite(data.bytes,1,data.length,stdout);
    return 0;
}}
