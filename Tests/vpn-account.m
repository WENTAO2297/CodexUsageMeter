#define CODEX_ACCOUNT_NO_MAIN
#import "../Sources/vpn-account.m"

int main(void) {
    @autoreleasepool {
        NSCAssert(ValidAuthorization(@"Bearer TEST_SECRET"), @"Normal authorization rejected");
        for (id bad in @[@"", @"short", @"token\nInjected", @"非ASCII登录", @0, NSNull.null]) {
            NSCAssert(!ValidAuthorization(bad), @"Invalid authorization accepted");
        }
        NSCAssert(AccountSameOrigin([NSURL URLWithString:@"https://app.maomao234.com/index.php#/login"]), @"Official origin rejected");
        for (NSString *url in @[@"http://app.maomao234.com/", @"https://app.maomao234.com.evil.invalid/", @"https://evil.invalid/", @"https://user:password@app.maomao234.com/", @"https://app.maomao234.com:444/"]) {
            NSCAssert(!AccountSameOrigin([NSURL URLWithString:url]), @"Unsafe origin accepted");
        }
        NSDictionary *body = @{@"data": @{@"u": @1073741824, @"d": @2147483648,
            @"transfer_enable": @429496729600LL, @"token": @"TEST_SECRET_TOKEN", @"subscribe_url": @"TEST_SECRET_URL"}};
        NSString *revision = AccountDigest(@"TEST_SECRET");
        NSDictionary *traffic = NormalizeAccountTraffic(body, revision);
        NSCAssert([traffic[@"usedBytes"] doubleValue] == 3221225472.0, @"Upload/download not combined");
        NSCAssert([traffic[@"remainingBytes"] doubleValue] == 426275504128.0, @"Remaining bytes incorrect");
        NSCAssert([traffic[@"accountKey"] length] == 64 && [traffic[@"credentialRevision"] length] == 64, @"Identity guards missing");
        NSString *output = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:traffic options:0 error:nil] encoding:NSUTF8StringEncoding];
        NSCAssert([output rangeOfString:@"TEST_SECRET"].location == NSNotFound, @"Credentials leaked");
        for (id bad in @[@YES, @-1, @1.5, @"1e10", @"bad", NSNull.null, @9007199254740992.0]) {
            NSCAssert(!AccountInteger(bad), @"Invalid traffic count accepted");
        }
        NSCAssert(!NormalizeAccountTraffic(@{}, revision), @"Missing body accepted");
        NSCAssert(!NormalizeAccountTraffic(body, @"bad-revision"), @"Missing session binding accepted");
        NSCAssert(!NormalizeAccountTraffic(@{@"data": @{@"u": @0, @"d": @0, @"transfer_enable": @0}}, revision), @"Unknown allowance accepted");
        for (NSNumber *days in @[@0, @1, @28, @31]) {
            NSMutableDictionary *data = [body[@"data"] mutableCopy]; data[@"reset_day"] = days;
            NSDictionary *reset = NormalizeAccountTraffic(@{@"data": data}, revision);
            NSCAssert([reset[@"resetDays"] isEqual:days], @"Website reset day changed");
            NSCAssert([reset[@"resetState"] isEqualToString:days.intValue == 0 ? @"today" : @"days"], @"Reset state incorrect");
        }
        for (id bad in @[@-1, @1.5, @"31", @YES, NSNull.null]) {
            NSMutableDictionary *data = [body[@"data"] mutableCopy]; data[@"reset_day"] = bad;
            NSDictionary *reset = NormalizeAccountTraffic(@{@"data": data}, revision);
            NSCAssert(reset && reset[@"resetDays"] == NSNull.null, @"Bad reset invalidated traffic or became a date");
        }
        long long now = 2000000000000LL;
        NSTimeZone *zone=[NSTimeZone timeZoneWithName:@"Asia/Shanghai"];
        NSCalendar *calendar=[[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];calendar.timeZone=zone;
        long long localStart=(long long)[calendar startOfDayForDate:[NSDate dateWithTimeIntervalSince1970:now/1000.0]].timeIntervalSince1970;
        NSDictionary *todayRows=@{@"data": @[@{@"record_at": @(localStart), @"u": @10, @"d": @20, @"server_rate": @2},
            @{@"record_at": @(localStart), @"u": @3, @"d": @5, @"server_rate": @3}]};
        NSDictionary *today=NormalizeAccountToday(todayRows,now,zone);
        NSCAssert([today[@"todayState"] isEqualToString:@"reported"] && [today[@"todayUsedBytes"] intValue]==38,@"Today's billed rows must sum once without multiplying server rate");
        NSCAssert([today[@"todayStartAt"] longLongValue]==localStart,@"Must use local midnight, not a UTC folded day");
        NSCAssert([NormalizeAccountToday(@{@"data": @[]},now,zone)[@"todayState"] isEqualToString:@"pending"],@"Missing today is not zero");
        NSCAssert([NormalizeAccountToday(@{@"data": todayRows[@"data"], @"total": @500},now,zone)[@"todayState"] isEqualToString:@"pending"],@"Pagination cannot claim a complete daily sum");
        NSCAssert([NormalizeAccountToday(todayRows,(localStart+86400+3600)*1000,zone)[@"todayState"] isEqualToString:@"pending"],@"Rollover cannot reuse yesterday's use");
        NSDictionary *zero=NormalizeAccountToday(@{@"data": @[@{@"record_at": @(localStart), @"u": @0, @"d": @0}]},now,zone);
        NSCAssert([zero[@"todayState"] isEqualToString:@"reported"] && [zero[@"todayUsedBytes"] intValue]==0,@"An explicit zero report is valid");
        NSCAssert([NormalizeAccountToday(todayRows,now,[NSTimeZone timeZoneForSecondsFromGMT:0])[@"todayState"] isEqualToString:@"pending"],@"Unknown billing/calendar boundary cannot be relabeled local today");
        NSDictionary *calendarHistory=NormalizeAccountCalendarDays(todayRows,now,zone);
        NSCAssert([calendarHistory[@"calendarState"] isEqualToString:@"ready"] &&
            [calendarHistory[@"calendarDays"][0][0] longLongValue]==localStart &&
            [calendarHistory[@"calendarDays"][0][1] intValue]==38,@"Chart dates retain real local starts and sum billed rows once");
        NSCAssert([NormalizeAccountCalendarDays(@{@"data": @[]},now,zone)[@"calendarDays"] count]==0,@"Missing dates stay absent, not zero filled");
        NSCAssert([NormalizeAccountCalendarDays(todayRows,now,[NSTimeZone timeZoneForSecondsFromGMT:0])[@"calendarState"] isEqualToString:@"unsupported"],@"Calendar chart cannot fold another timezone's daily starts");
        NSCAssert([NormalizeAccountCalendarDays(@{@"data": todayRows[@"data"],@"total": @100},now,zone)[@"calendarDays"] count]==0,@"Paginated chart data must abstain");
        NSCAssert([NormalizeAccountCalendarDays(@{@"data": @[todayRows[@"data"][0],todayRows[@"data"][0]]},now,zone)[@"calendarDays"] count]==0,@"Duplicate chart rows must not double count");
        NSCAssert([NormalizeAccountCalendarDays(@{@"data": @[@{@"record_at": @(localStart),@"u": @0,@"d": @0}]},now,zone)[@"calendarDays"][0][1] intValue]==0,@"Explicit zero is a real daily report");
        NSDictionary *history = NormalizeAccountHistory(@{@"data": @[
            @{@"record_at": @1999900000, @"u": @10, @"d": @20, @"server_rate": @2},
            @{@"record_at": @1999900000, @"u": @10, @"d": @20, @"server_rate": @3}]}, revision, now);
        NSCAssert([history[@"state"] isEqualToString:@"ready"] && [history[@"days"][0][1] intValue] == 60, @"History rate rows must sum u+d without multiplying rates");
        NSCAssert([history[@"completeness"] isEqualToString:@"unverified"], @"Fixture cannot verify history completeness");
        NSMutableArray *rows = [NSMutableArray array];
        for (int i = 0; i < 35; i++) [rows addObject:@{@"record_at": @((now / 1000 / 86400) * 86400 + 3600 - i * 86400LL), @"u": @(i), @"d": @0}];
        NSDictionary *bounded = NormalizeAccountHistory(@{@"data": rows}, revision, now);
        NSCAssert([bounded[@"days"] count] == 35 && [NSJSONSerialization dataWithJSONObject:bounded options:0 error:nil].length < 8192, @"History output exceeds pipe bound");
        [rows addObject:@{@"record_at": @1996000000, @"u": @0, @"d": @0}];
        NSCAssert([NormalizeAccountHistory(@{@"data": rows}, revision, now)[@"state"] isEqualToString:@"ready"], @"Old dates must trim without rejecting valid recent history");
        [rows removeAllObjects];
        for (int i = 0; i < 56; i++) [rows addObject:@{@"record_at": @(1999900000LL - i * 86400LL), @"u": @(i), @"d": @0}];
        NSDictionary *expanded = NormalizeAccountHistory(@{@"data": rows}, revision, now);
        NSCAssert([expanded[@"days"] count] == 56 && ![expanded[@"diagnostics"][@"retentionTrimmed"] boolValue], @"Recover all 56 days, not only the recent 35");
        NSCAssert([expanded[@"retentionDays"] intValue] == 180, @"Report the supported history retention for cache migration");
        [rows removeAllObjects];
        for (int i = 0; i < 200; i++) [rows addObject:@{@"record_at": @(localStart - i * 86400LL),
            @"u": @9007199254740991.0, @"d": @0}];
        long long archiveNow = (localStart + 3600) * 1000;
        NSDictionary *trimmed = NormalizeAccountHistory(@{@"data": rows}, revision, archiveNow);
        NSCAssert([trimmed[@"days"] count] == 180 && [trimmed[@"diagnostics"][@"retentionTrimmed"] boolValue], @"Bound the expanded archive at 180 UTC dates");
        NSCAssert([trimmed[@"calendarDays"] count] == 35, @"The chart keeps its small calendar response and unchanged range");
        NSData *boundedOutput = [NSJSONSerialization dataWithJSONObject:@{@"version":@3,@"state":@"history",@"history":trimmed} options:0 error:nil];
        NSCAssert(boundedOutput.length < 8192,
            @"Even maximum safe counts over 180 dates and 35 chart dates must fit the existing nonblocking pipe bound");
        NSDictionary *duplicate = @{@"record_at": @1999900000, @"u": @10, @"d": @20};
        NSCAssert([NormalizeAccountHistory(@{@"data": @[duplicate, duplicate]}, revision, now)[@"state"] isEqualToString:@"partial"], @"Unconfirmed duplicate rows cannot double count");
        NSCAssert([NormalizeAccountHistory(@{@"data": @{}}, revision, now)[@"state"] isEqualToString:@"unsupported"], @"Unknown shape accepted");
        NSCAssert([NormalizeAccountHistory(@{@"data": @[duplicate], @"total": @500}, revision, now)[@"state"] isEqualToString:@"partial"], @"Unconfirmed pagination accepted");
        NSString *historyOutput = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:history options:0 error:nil] encoding:NSUTF8StringEncoding];
        NSCAssert([historyOutput rangeOfString:@"TEST_SECRET"].location == NSNotFound && [historyOutput rangeOfString:@"server_rate"].location == NSNotFound, @"Raw history fields escaped whitelist");
        puts("Account helper checks passed: origin/header guards, byte schema, identity binding and sanitized output (no credentials/network/window).");
    }
    return 0;
}
