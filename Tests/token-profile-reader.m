#define main profile_production_main
#include "../Sources/token-profile-reader.m"
#undef main
#include <assert.h>

int main(void) { @autoreleasepool {
    NSTimeZone *zone=[NSTimeZone timeZoneWithName:@"Asia/Shanghai"];
    NSDateFormatter *format=ProfileDateFormatter();double now=[format dateFromString:@"2026-10-17"].timeIntervalSince1970+12*3600;
    NSMutableArray *buckets=[NSMutableArray new];
    for (NSInteger day=10;day<=17;day++) [buckets addObject:@{@"start_date":[NSString stringWithFormat:@"2026-10-%02ld",(long)day],@"tokens":@(day*100)}];
    [buckets addObject:@{@"start_date":@"2026-10-15",@"tokens":@25}];
    [buckets addObject:@{@"start_date":@"2026-10-18",@"tokens":@999999}];
    NSDictionary *(^reply)(id)=^NSDictionary *(id rows){return @{@"stats":@{@"daily_usage_buckets":rows,@"email":@"PRIVATE"},
        @"metadata":@{@"stats_error":NSNull.null},@"profile":@{@"username":@"PRIVATE"}};};
    NSDictionary *summary=ProfileSummary(reply(buckets),@"fixture-account",now,zone);
    assert(summary && [summary[@"days"] count]==30);
    assert([summary[@"days"][0][@"date"] isEqual:@"2026-09-18"] && [summary[@"days"][29][@"date"] isEqual:@"2026-10-17"]);
    assert([summary[@"days"][27][@"tokens"] intValue]==1525);
    double total=0;for(NSDictionary *day in summary[@"days"])total+=[day[@"tokens"] doubleValue];assert(total==10825);
    NSString *text=[[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:summary options:0 error:nil] encoding:NSUTF8StringEncoding];
    assert(![text containsString:@"PRIVATE"] && ![text containsString:@"profile_picture"] && ![text containsString:@"access"]);
    assert([summary[@"source"] isEqual:@"profile"] && [summary[@"version"] intValue]==3);
    summary=ProfileSummary(reply(@[]),@"fixture-account",now,zone);assert(summary && [summary[@"days"][0][@"tokens"] intValue]==0);
    assert(!ProfileSummary(@{},@"fixture-account",now,zone));
    assert(!ProfileSummary(@{@"stats":@{@"daily_usage_buckets":@[]},@"metadata":@{@"stats_error":@"failed"}},@"fixture-account",now,zone));
    for(id tokens in @[@YES,@(-1),@1.5,@(INFINITY),@9007199254740992.0])
        assert(!ProfileSummary(reply(@[@{@"start_date":@"2026-10-15",@"tokens":tokens}]),@"fixture-account",now,zone));
    assert(!ProfileSummary(reply(@[@{@"start_date":@"2026-02-30",@"tokens":@1}]),@"fixture-account",now,zone));
    summary=ProfileSummary(reply(@[]),@"fixture-account",[format dateFromString:@"2026-10-17"].timeIntervalSince1970-3600,zone);
    assert([summary[@"days"][29][@"date"] isEqual:@"2026-10-17"]);
    summary=ProfileSummary(reply(@[]),@"fixture-account",[format dateFromString:@"2024-03-01"].timeIntervalSince1970+12*3600,zone);
    assert([summary[@"days"][0][@"date"] isEqual:@"2024-02-01"] && [summary[@"days"][29][@"date"] isEqual:@"2024-03-01"]);
    assert(!ProfileString(@"token\nheader",100));assert(!ProfileInteger(@YES));
    ProfileTransport *transport=[ProfileTransport new];transport.data=[NSMutableData new];transport.done=dispatch_semaphore_create(0);
    NSURLSession *offline=[NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration];
    NSURLRequest *request=[NSURLRequest requestWithURL:[NSURL URLWithString:ProfileEndpoint]];
    NSURLSessionDataTask *task=[offline dataTaskWithRequest:request]; // Never resumed.
    NSHTTPURLResponse *redirect=[[NSHTTPURLResponse alloc] initWithURL:request.URL statusCode:302 HTTPVersion:@"HTTP/1.1" headerFields:@{}];
    __block BOOL noRedirect=NO;
    [transport URLSession:offline task:task willPerformHTTPRedirection:redirect newRequest:request completionHandler:^(NSURLRequest *next){noRedirect=next==nil;}];
    assert(noRedirect && transport.failed);transport.failed=NO;
    [transport URLSession:offline dataTask:task didReceiveData:[NSMutableData dataWithLength:ProfileLimit+1]];
    assert(transport.failed && transport.data.length==0);
    __block BOOL capped=NO;transport.failed=NO;
    NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:[NSURL URLWithString:ProfileEndpoint] statusCode:200 HTTPVersion:@"HTTP/1.1"
        headerFields:@{@"Content-Length":[NSString stringWithFormat:@"%lu",(unsigned long)ProfileLimit+1]}];
    [transport URLSession:offline dataTask:task didReceiveResponse:response completionHandler:^(NSURLSessionResponseDisposition value){capped=value==NSURLSessionResponseCancel;}];
    assert(capped && transport.failed);
    [offline invalidateAndCancel];
    puts("Native profile reader passed: thirty canonical dates, month/leap/local-midnight boundaries, sums/zero/privacy, redirects denied and response size capped (offline).");
    return 0;
}}
