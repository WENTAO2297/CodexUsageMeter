#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <CommonCrypto/CommonDigest.h>
#import <math.h>

// Fixed, user-supplied official origin. No caller-controlled endpoints, headers,
// token arguments, environment credentials, external redirects or TLS overrides.
static NSString *const AccountOrigin = @"https://app.maomao234.com";
static NSString *const AccountService = @"com.wentao.codex-usage-meter.maomaoyun";
static NSUInteger const ResponseLimit = 262144;
static NSInteger const AccountHistoryDays = 180;

static NSDictionary *AccountFailure(NSString *state) {
    return @{@"version": @3, @"state": state};
}

static BOOL ValidAuthorization(id value) {
    if (![value isKindOfClass:NSString.class] || [value length] < 8 || [value length] > 8192) return NO;
    for (NSUInteger i = 0; i < [value length]; i++) {
        unichar character = [value characterAtIndex:i];
        if (character < 32 || character > 126) return NO;
    }
    return YES;
}

static NSString *AccountDigest(NSString *value) {
    NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
    NSMutableString *result = [NSMutableString string];
    for (NSUInteger i = 0; i < sizeof(digest); i++) [result appendFormat:@"%02x", digest[i]];
    return result;
}

static BOOL AccountSameOrigin(NSURL *url) {
    return [url.scheme.lowercaseString isEqualToString:@"https"] &&
        [url.host.lowercaseString isEqualToString:@"app.maomao234.com"] &&
        (!url.port || url.port.integerValue == 443) && !url.user && !url.password;
}

static NSMutableDictionary *CredentialQuery(BOOL interactive) {
    NSMutableDictionary *query = [@{(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: AccountService, (__bridge id)kSecAttrAccount: AccountOrigin,
        (__bridge id)kSecAttrSynchronizable: @NO} mutableCopy];
    if (!interactive) {
        LAContext *context = [[LAContext alloc] init];
        context.interactionNotAllowed = YES;
        query[(__bridge id)kSecUseAuthenticationContext] = context;
    }
    return query;
}

static NSString *ReadCredential(BOOL interactive, OSStatus *status) {
    NSMutableDictionary *query = CredentialQuery(interactive);
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef item = NULL;
    OSStatus result = SecItemCopyMatching((__bridge CFDictionaryRef)query, &item);
    if (status) *status = result;
    NSData *data = CFBridgingRelease(item);
    if (result != errSecSuccess || ![data isKindOfClass:NSData.class] || data.length > 8192) return nil;
    NSString *token = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return ValidAuthorization(token) ? token : nil;
}

static BOOL SaveCredential(NSString *token) {
    if (!ValidAuthorization(token)) return NO;
    NSMutableDictionary *query = CredentialQuery(YES);
    NSData *data = [token dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *update = @{(__bridge id)kSecValueData: data,
        (__bridge id)kSecAttrLabel: @"Codex Usage Meter · MaoMaoYun"};
    OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)update);
    if (status == errSecItemNotFound) {
        [query addEntriesFromDictionary:update];
        status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
    }
    return status == errSecSuccess;
}

static NSNumber *AccountInteger(id value) {
    if ([value isKindOfClass:NSNumber.class]) {
        if (CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return nil;
    } else if ([value isKindOfClass:NSString.class]) {
        if ([value length] == 0 || [value length] > 16 ||
            [value rangeOfCharacterFromSet:[NSCharacterSet characterSetWithCharactersInString:@"0123456789"].invertedSet].location != NSNotFound) return nil;
    } else return nil;
    double number = [value doubleValue];
    if (!isfinite(number) || number < 0 || floor(number) != number || number > 9007199254740991.0) return nil;
    return @(number);
}

static NSDictionary *NormalizeAccountTraffic(NSDictionary *reply, NSString *revision) {
    id data = reply[@"data"];
    if (![data isKindOfClass:NSDictionary.class] || revision.length != 64) return nil;
    NSNumber *upload = AccountInteger(data[@"u"]), *download = AccountInteger(data[@"d"]);
    NSNumber *total = AccountInteger(data[@"transfer_enable"]);
    if (!upload || !download || !total || total.doubleValue <= 0) return nil;
    double used = upload.doubleValue + download.doubleValue;
    if (used > 9007199254740991.0) return nil;
    // Strict output allowlist. Never serialize email, token, subscription URLs,
    // raw server bodies, headers or exception descriptions to stdout or logs.
    // This internal API does not promise an ID in /user/info. Namespace values
    // by this validated login session instead; reauthentication drops old data.
    id reset = data[@"reset_day"];
    NSNumber *days = [reset isKindOfClass:NSNumber.class] ? AccountInteger(reset) : nil;
    NSString *resetState = !reset || reset == NSNull.null ? @"unavailable" : !days ? @"invalid" : days.doubleValue == 0 ? @"today" : @"days";
    return @{@"accountKey": AccountDigest([AccountOrigin stringByAppendingFormat:@"/%@", revision]),
        @"identityKind": @"session", @"resetDays": days ?: (id)NSNull.null, @"resetState": resetState,
        @"credentialRevision": revision, @"usedBytes": @(used), @"totalBytes": total,
        @"remainingBytes": @(MAX(0, total.doubleValue - used)),
        @"reportedAt": @((long long)(NSDate.date.timeIntervalSince1970 * 1000))};
}

// Today uses the exact local calendar boundary, never a folded UTC bucket or
// total allowance delta. Missing/paginated/ambiguous reports are not zero use.
static NSDictionary *NormalizeAccountToday(NSDictionary *reply, long long now, NSTimeZone *zone) {
    NSCalendar *calendar = [[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];
    calendar.timeZone = zone;
    NSDate *current = [NSDate dateWithTimeIntervalSince1970:now / 1000.0];
    long long start = (long long)[calendar startOfDayForDate:current].timeIntervalSince1970;
    NSDictionary *pending = @{@"todayState": @"pending", @"todayStartAt": @(start), @"todayReportedAt": @(now)};
    id rows = reply[@"data"];
    if (![rows isKindOfClass:NSArray.class] || [rows count] > 10000 ||
        reply[@"total"] || reply[@"next_page_url"] || reply[@"current_page"]) return pending;
    double bytes = 0; BOOL found = NO; NSMutableSet *seen = [NSMutableSet set];
    for (id row in rows) {
        if (![row isKindOfClass:NSDictionary.class]) return pending;
        NSNumber *at = AccountInteger(row[@"record_at"]), *u = AccountInteger(row[@"u"]), *d = AccountInteger(row[@"d"]);
        if (!at || !u || !d || at.doubleValue <= 0 || at.doubleValue > now/1000.0 + 60 ||
            u.doubleValue+d.doubleValue > 9007199254740991.0) return pending;
        // Require daily starts matching this calendar. Hourly or another
        // timezone's rows must not silently become local "today".
        NSDate *date = [NSDate dateWithTimeIntervalSince1970:at.doubleValue];
        if ((long long)[calendar startOfDayForDate:date].timeIntervalSince1970 != at.longLongValue) return pending;
        NSString *fingerprint = [NSString stringWithFormat:@"%@:%@:%@:%@",at,u,d,row[@"server_rate"] ?: @""];
        if ([seen containsObject:fingerprint]) return pending;
        [seen addObject:fingerprint];
        if (at.longLongValue == start) { bytes += u.doubleValue+d.doubleValue; found = YES; }
        if (bytes > 9007199254740991.0) return pending;
    }
    if (!found) return pending;
    return @{@"todayState": @"reported", @"todayStartAt": @(start), @"todayReportedAt": @(now), @"todayUsedBytes": @(bytes)};
}

// Calendar dates for the activity chart are separate from forecasting's UTC
// buckets. Only exact local daily starts can be labeled as calendar days.
static NSDictionary *NormalizeAccountCalendarDays(NSDictionary *reply, long long now, NSTimeZone *zone) {
    NSDictionary *unknown = @{@"calendarBasis": @"local-midnight", @"calendarState": @"unsupported", @"calendarDays": @[]};
    id rows = reply[@"data"];
    if (![rows isKindOfClass:NSArray.class] || [rows count] > 10000 ||
        reply[@"total"] || reply[@"next_page_url"] || reply[@"current_page"]) return unknown;
    NSCalendar *calendar = [[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];
    calendar.timeZone = zone;
    NSDate *today = [calendar startOfDayForDate:[NSDate dateWithTimeIntervalSince1970:now/1000.0]];
    long long earliest = (long long)[calendar dateByAddingUnit:NSCalendarUnitDay value:-34 toDate:today options:0].timeIntervalSince1970;
    NSMutableDictionary *totals = [NSMutableDictionary dictionary];
    NSMutableSet *seen = [NSMutableSet set];
    for (id row in rows) {
        if (![row isKindOfClass:NSDictionary.class]) return unknown;
        NSNumber *at = AccountInteger(row[@"record_at"]), *u = AccountInteger(row[@"u"]), *d = AccountInteger(row[@"d"]);
        if (!at || !u || !d || at.doubleValue <= 0 || at.doubleValue > now/1000.0+60 ||
            u.doubleValue+d.doubleValue > 9007199254740991.0) return unknown;
        NSDate *date = [NSDate dateWithTimeIntervalSince1970:at.doubleValue];
        if ((long long)[calendar startOfDayForDate:date].timeIntervalSince1970 != at.longLongValue) return unknown;
        NSString *fingerprint = [NSString stringWithFormat:@"%@:%@:%@:%@",at,u,d,row[@"server_rate"] ?: @""];
        if ([seen containsObject:fingerprint]) return unknown;
        [seen addObject:fingerprint];
        double total = [totals[at] doubleValue]+u.doubleValue+d.doubleValue;
        if (total > 9007199254740991.0) return unknown;
        totals[at] = @(total);
    }
    NSMutableArray *days = [NSMutableArray array];
    for (NSNumber *at in [[totals allKeys] sortedArrayUsingSelector:@selector(compare:)])
        if (at.longLongValue >= earliest) [days addObject:@[at,totals[at]]];
    return @{@"calendarBasis": @"local-midnight", @"calendarState": @"ready", @"calendarDays": days};
}

// UTC fixed 24h buckets are explicit; they do not assert a server calendar.
// Sum billed u+d
// across rate rows; multiplying by server_rate again would double charge.
static NSDictionary *NormalizeAccountHistory(NSDictionary *reply, NSString *revision, long long now) {
    NSDictionary *binding = @{@"accountKey": AccountDigest([AccountOrigin stringByAppendingFormat:@"/%@", revision]),
        @"credentialRevision": revision, @"identityKind": @"session", @"fetchedAt": @(now),
        @"retentionDays": @(AccountHistoryDays),
        @"completeness": @"unverified", @"billingBasis": @"website-u+d", @"bucketBasis": @"utc-24h"};
    NSMutableDictionary *result = [binding mutableCopy];
    [result addEntriesFromDictionary:NormalizeAccountCalendarDays(reply, now, NSTimeZone.localTimeZone)];
    id rows = reply[@"data"];
    result[@"state"] = @"unsupported"; result[@"days"] = @[];
    if (![rows isKindOfClass:NSArray.class] || [rows count] > 10000) return result;
    result[@"rowCount"] = @([rows count]);
    NSMutableDictionary *totals = [NSMutableDictionary dictionary];
    NSMutableSet *seen = [NSMutableSet set];
    BOOL pagination = reply[@"total"] || reply[@"next_page_url"] || reply[@"current_page"];
    BOOL partial = pagination, duplicateRows = NO, invalidNumbers = NO;
    NSUInteger validRows = 0, nonDailyRows = 0;
    for (id row in rows) {
        if (![row isKindOfClass:NSDictionary.class]) { partial = YES; invalidNumbers = YES; break; }
        NSNumber *at = AccountInteger(row[@"record_at"]), *u = AccountInteger(row[@"u"]), *d = AccountInteger(row[@"d"]);
        if (!at || !u || !d || at.doubleValue <= 0 || at.doubleValue > now / 1000.0 + 60 ||
            u.doubleValue + d.doubleValue > 9007199254740991.0) { partial = YES; invalidNumbers = YES; break; }
        // An identical row might be a replay; its semantics cannot be inferred.
        NSString *fingerprint = [NSString stringWithFormat:@"%@:%@:%@:%@", at, u, d, row[@"server_rate"] ?: @""];
        if ([seen containsObject:fingerprint]) { partial = YES; duplicateRows = YES; break; }
        [seen addObject:fingerprint];
        validRows++;
        if (at.longLongValue % 86400 != 0) nonDailyRows++;
        NSNumber *bucket = @((at.longLongValue / 86400) * 86400);
        double total = [totals[bucket] doubleValue] + u.doubleValue + d.doubleValue;
        if (total > 9007199254740991.0) { partial = YES; invalidNumbers = YES; break; }
        totals[bucket] = @(total);
    }
    NSArray *dates = [[totals allKeys] sortedArrayUsingSelector:@selector(compare:)];
    NSUInteger originalCount = dates.count;
    long long earliest = ((now / 1000 / 86400) - (AccountHistoryDays - 1)) * 86400;
    dates = [dates filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSNumber *at, NSDictionary *bindings) {
        (void)bindings; return at.longLongValue >= earliest;
    }]];
    result[@"diagnostics"] = @{@"duplicateRows": @(duplicateRows), @"pagination": @(pagination),
        @"invalidNumbers": @(invalidNumbers), @"retentionTrimmed": @(dates.count < originalCount),
        @"validRows": @(validRows), @"nonDailyRows": @(nonDailyRows), @"bucketCount": @(originalCount),
        @"retainedBucketCount": @(dates.count)};
    NSMutableArray *days = [NSMutableArray array];
    if (!partial) for (NSNumber *at in dates) [days addObject:@[@(at.longLongValue), totals[at]]];
    result[@"state"] = partial ? @"partial" : @"ready";
    result[@"days"] = days; result[@"dayCount"] = @(days.count);
    if (days.count) { result[@"sourceStart"] = dates.firstObject; result[@"sourceEnd"] = dates.lastObject; }
    return result;
}

@interface AccountSessionDelegate : NSObject <NSURLSessionTaskDelegate, NSURLSessionDataDelegate>
@end
@implementation AccountSessionDelegate
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task
    willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request
    completionHandler:(void (^)(NSURLRequest *))handler {
    (void)session; (void)task; (void)response; (void)request;
    handler(nil); // Never forward Authorization, even to a redirect on this origin.
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task
    didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))handler {
    (void)session; (void)task;
    handler(response.expectedContentLength > (long long)ResponseLimit ? NSURLSessionResponseCancel : NSURLSessionResponseAllow);
}
@end

typedef void (^AccountJSONCompletion)(NSDictionary *, NSString *, NSDictionary *);
static void FetchAccountJSON(NSURLSession *session, NSString *path, NSString *token, AccountJSONCompletion done) {
    NSURL *url = [NSURL URLWithString:[AccountOrigin stringByAppendingString:path]];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:12];
    request.HTTPMethod = @"GET";
    [request setValue:token forHTTPHeaderField:@"authorization"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Accept"];
    [request setValue:@"en-US" forHTTPHeaderField:@"Content-Language"];
    [[session dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error || ![response isKindOfClass:NSHTTPURLResponse.class] || !AccountSameOrigin(response.URL)) {
            done(nil, @"error", @{@"transportCode": @(error ? error.code : 0)}); return;
        }
        NSInteger status = [(NSHTTPURLResponse *)response statusCode];
        NSDictionary *diagnostics = @{@"httpStatus": @(status)};
        if (status == 401 || status == 403) { done(nil, @"authRequired", diagnostics); return; }
        if (status == 429) { done(nil, @"rateLimited", diagnostics); return; }
        if (status != 200 || !data.length || data.length > ResponseLimit) { done(nil, @"error", diagnostics); return; }
        id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if (![object isKindOfClass:NSDictionary.class]) { done(nil, @"invalid", diagnostics); return; }
        done(object, nil, diagnostics);
    }] resume];
}

typedef void (^AccountResultCompletion)(NSDictionary *);
static void FetchAccountData(NSString *token, BOOL historyMode, AccountResultCompletion done) {
    if (!ValidAuthorization(token)) { done(AccountFailure(@"authRequired")); return; }
    NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    configuration.URLCache = nil;
    configuration.HTTPCookieStorage = nil;
    configuration.HTTPShouldSetCookies = NO;
    configuration.timeoutIntervalForRequest = 12;
    configuration.timeoutIntervalForResource = 14;
    configuration.TLSMinimumSupportedProtocolVersion = tls_protocol_version_TLSv12;
    AccountSessionDelegate *guard = [[AccountSessionDelegate alloc] init];
    NSURLSession *session = [NSURLSession sessionWithConfiguration:configuration delegate:guard delegateQueue:nil];
    FetchAccountJSON(session, historyMode ? @"/api/v1/user/stat/getTrafficLog" : @"/api/v1/user/getSubscribe", token, ^(NSDictionary *reply, NSString *failure, NSDictionary *diagnostics) {
        if (historyMode) {
            [session finishTasksAndInvalidate];
            NSDictionary *history = failure ? @{@"state": failure, @"days": @[]} : NormalizeAccountHistory(reply, AccountDigest(token), (long long)(NSDate.date.timeIntervalSince1970 * 1000));
            done(@{@"version": @3, @"state": @"history", @"history": history}); return;
        }
        NSDictionary *traffic = failure ? nil : NormalizeAccountTraffic(reply, AccountDigest(token));
        if (traffic) {
            // Both requests share the same authenticated session and fixed
            // official origin. Today's failure never discards the balance.
            FetchAccountJSON(session, @"/api/v1/user/stat/getTrafficLog", token, ^(NSDictionary *dailyReply, NSString *dailyFailure, NSDictionary *dailyDiagnostics) {
                (void)dailyDiagnostics;
                [session finishTasksAndInvalidate];
                long long at = (long long)(NSDate.date.timeIntervalSince1970 * 1000);
                NSMutableDictionary *result = [traffic mutableCopy];
                [result addEntriesFromDictionary:NormalizeAccountToday(dailyFailure ? @{} : dailyReply, at, NSTimeZone.localTimeZone)];
                [result addEntriesFromDictionary:NormalizeAccountCalendarDays(dailyFailure ? @{} : dailyReply, at, NSTimeZone.localTimeZone)];
                result[@"calendarReportedAt"] = @(at);
                if ([dailyFailure isEqualToString:@"rateLimited"]) result[@"todayRetryAt"] = @(at + 15 * 60 * 1000);
                done(@{@"version": @3, @"state": @"ready", @"traffic": result});
            });
            return;
        }
        [session finishTasksAndInvalidate];
        NSMutableDictionary *result = [AccountFailure(failure ?: @"invalid") mutableCopy];
        result[@"diagnostics"] = diagnostics ?: @{};
        if (!failure) {
            id data = reply[@"data"];
            BOOL dictionary = [data isKindOfClass:NSDictionary.class];
            result[@"schema"] = @{@"dataObject": @(dictionary),
                @"uploadNumber": @(dictionary && AccountInteger(data[@"u"]) != nil),
                @"downloadNumber": @(dictionary && AccountInteger(data[@"d"]) != nil),
                @"totalNumber": @(dictionary && AccountInteger(data[@"transfer_enable"]) != nil)};
        }
        done(result);
    });
}

static void FetchAccountTraffic(NSString *token, AccountResultCompletion done) { FetchAccountData(token, NO, done); }

static void PrintAccountResult(NSDictionary *result) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    if (data.length >= 8192) data = [NSJSONSerialization dataWithJSONObject:@{@"version": @3, @"state": @"history", @"history": @{@"state": @"outputLimited"}} options:0 error:nil];
    if (data) { fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout); }
}

@interface AccountLoginDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate>
@property(nonatomic) BOOL english;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *web;
@property(nonatomic, strong) NSTextField *status;
@property(nonatomic, strong) NSButton *connect;
@property(nonatomic) BOOL verifying;
@property(nonatomic) BOOL finished;
@end

@implementation AccountLoginDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 980, 720)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = self.english ? @"Codex Usage Meter — Sign in to MaoMaoYun" : @"Codex Usage Meter — 登录 MaoMaoYun";
    self.window.minSize = NSMakeSize(760, 600);
    self.window.delegate = self;
    self.window.releasedWhenClosed = NO;
    NSView *content = self.window.contentView;
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
    self.web = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 86, 980, 634) configuration:configuration];
    self.web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.web.navigationDelegate = self;
    [content addSubview:self.web];
    self.status = [NSTextField wrappingLabelWithString:self.english ? @"Sign in at app.maomao234.com, then click Verify and Connect.\nYour password goes only to the official website; session credentials are stored in this app's Keychain item, never sent to chat." : @"请在 app.maomao234.com 正常登录，然后点击“验证并连接”。\n密码仅提交给官网；成功后会话凭据存系统钥匙串，不发送到聊天。"];
    self.status.frame = NSMakeRect(16, 14, 715, 58);
    self.status.autoresizingMask = NSViewWidthSizable;
    [content addSubview:self.status];
    self.connect = [NSButton buttonWithTitle:self.english ? @"Verify and Connect" : @"验证并连接" target:self action:@selector(connectAccount:)];
    self.connect.bezelStyle = NSBezelStyleRounded;
    self.connect.frame = NSMakeRect(790, 25, 170, 36);
    self.connect.autoresizingMask = NSViewMinXMargin;
    [content addSubview:self.connect];
    [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[AccountOrigin stringByAppendingString:@"/index.php#/login"]]]];
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
    (void)web;
    BOOL mainFrame = !action.targetFrame || action.targetFrame.mainFrame;
    handler(!mainFrame || AccountSameOrigin(action.request.URL) ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)connectAccount:(id)sender {
    (void)sender;
    if (self.verifying || !AccountSameOrigin(self.web.URL)) return;
    self.verifying = YES;
    self.connect.enabled = NO;
    self.status.stringValue = self.english ? @"Verifying the website session and traffic query; no purchases, traffic resets or VPN changes." : @"正在验证官网身份与流量查询；不会购买、重置流量或切换 VPN。";
    __weak AccountLoginDelegate *owner = self;
    // Only this explicit user button reads this web view's own official-origin
    // session. Never inspect password inputs or another browser/client's storage.
    [self.web evaluateJavaScript:@"window.localStorage.getItem('authorization') || ''" completionHandler:^(id value, NSError *error) {
        AccountLoginDelegate *app = owner;
        if (!app || app.finished) return;
        if (error || !AccountSameOrigin(app.web.URL) || !ValidAuthorization(value)) {
            app.status.stringValue = app.english ? @"No website session found. Sign in first, then click Verify and Connect." : @"尚未取得官网登录会话。请先登录，再点击“验证并连接”。";
            app.verifying = NO; app.connect.enabled = YES;
            return;
        }
        NSString *token = value;
        FetchAccountTraffic(token, ^(NSDictionary *result) {
            dispatch_async(dispatch_get_main_queue(), ^{
                AccountLoginDelegate *current = owner;
                if (!current || current.finished) return;
                if (![result[@"state"] isEqualToString:@"ready"]) {
                    PrintAccountResult(result); // Only fixed codes/boolean schema flags, never server text or fields.
                    NSString *state = result[@"state"];
                    NSDictionary *details = result[@"diagnostics"];
                    if ([state isEqualToString:@"authRequired"]) current.status.stringValue = current.english ? @"The website rejected this session. Sign in again; VPN and existing credentials are unchanged." : @"官网查询拒绝了当前会话。请重新登录后再验证；不会修改 VPN 或已有凭据。";
                    else if ([state isEqualToString:@"invalid"]) current.status.stringValue = current.english ? @"Traffic fields failed validation. No new credentials saved; the website interface may have changed." : @"官网已回应，但流量字段未通过校验。没有保存新凭据，请检查接口是否已变更。";
                    else if ([state isEqualToString:@"rateLimited"]) current.status.stringValue = current.english ? @"The website limited queries. Try later; VPN and existing credentials are unchanged." : @"官网暂时限制查询频率，请稍后再验证；不会修改 VPN 或已有凭据。";
                    else current.status.stringValue = [NSString stringWithFormat:current.english ? @"Query failed (HTTP %@; network error %@). No new credentials saved; check the network and retry." : @"查询失败（HTTP %@；系统网络错误 %@）。没有保存新凭据，请检查网络后重试。", details[@"httpStatus"] ?: @"—", details[@"transportCode"] ?: @"—"];
                    current.verifying = NO; current.connect.enabled = YES;
                    return;
                }
                if (!SaveCredential(token)) {
                    current.status.stringValue = current.english ? @"The website query succeeded, but Keychain saving failed. Allow this app to store its own credentials, then retry." : @"接口已验证，但系统钥匙串保存未成功。请允许本程序保存其自身登录凭据后重试。";
                    current.verifying = NO; current.connect.enabled = YES;
                    return;
                }
                current.finished = YES;
                PrintAccountResult(result);
                [NSApp terminate:nil];
            });
        });
    }];
}
- (BOOL)windowShouldClose:(NSWindow *)sender {
    (void)sender;
    if (!self.finished) { self.finished = YES; PrintAccountResult(AccountFailure(@"cancelled")); }
    [NSApp terminate:nil];
    return YES;
}
@end

#ifndef CODEX_ACCOUNT_NO_MAIN
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) { PrintAccountResult(AccountFailure(@"invalidCommand")); return 1; }
        NSString *mode = [NSString stringWithUTF8String:argv[1]];
        if ([mode isEqualToString:@"--login"] || [mode isEqualToString:@"--login-en"]) {
            NSApplication *app = NSApplication.sharedApplication;
            [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
            __attribute__((objc_precise_lifetime)) AccountLoginDelegate *delegate = [[AccountLoginDelegate alloc] init];
            delegate.english = [mode isEqualToString:@"--login-en"];
            app.delegate = delegate;
            [app run];
            return 0;
        }
        BOOL probe = [mode isEqualToString:@"--probe"];
        BOOL historyMode = [mode isEqualToString:@"--history"];
        if (!probe && !historyMode && ![mode isEqualToString:@"--read"]) { PrintAccountResult(AccountFailure(@"invalidCommand")); return 1; }
        OSStatus status = errSecSuccess;
        NSString *token = probe ? @"UnauthenticatedInterfaceProbe" : ReadCredential(NO, &status);
        if (!token) {
            PrintAccountResult(AccountFailure(status == errSecInteractionNotAllowed || status == errSecAuthFailed ? @"keychainLocked" : @"authRequired"));
            return 0;
        }
        dispatch_semaphore_t finished = dispatch_semaphore_create(0);
        __block NSDictionary *result;
        FetchAccountData(token, historyMode, ^(NSDictionary *response) { result = response; dispatch_semaphore_signal(finished); });
        if (dispatch_semaphore_wait(finished, dispatch_time(DISPATCH_TIME_NOW, 29 * NSEC_PER_SEC)) != 0) {
            PrintAccountResult(AccountFailure(@"timeout")); return 0;
        }
        if (!probe && ([result[@"state"] isEqualToString:@"ready"] || [result[@"state"] isEqualToString:@"history"])) {
            NSString *current = ReadCredential(NO, NULL);
            if (![current isEqualToString:token]) result = AccountFailure(@"credentialChanged");
        }
        PrintAccountResult(result ?: AccountFailure(@"error"));
    }
    return 0;
}
#endif
