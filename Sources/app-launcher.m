#import <Cocoa/Cocoa.h>
#import <fcntl.h>
#import <signal.h>
#import <sys/file.h>
#import <unistd.h>

// The native app owns the existing JXA widget, just as the previous shell
// watcher did. Menu rendering and quota/VPN business logic stay in JXA.
@interface MeterAppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSTask *widget;
@property(nonatomic, strong) NSTask *vpn;
@property(nonatomic, strong) NSFileHandle *processLog;
@property(nonatomic, copy) NSString *dataDirectory;
@property(nonatomic, strong) dispatch_source_t terminationSignal;
@property(nonatomic, strong) dispatch_source_t interruptSignal;
@property(nonatomic) int instanceLock;
@property(nonatomic) BOOL stopping;
@end

// Caught signals reset to their defaults when NSTask execs a child. Using a
// no-op handler instead of SIG_IGN keeps child termination working normally.
static void meterSignalHandler(int signalNumber) { (void)signalNumber; }

@implementation MeterAppDelegate
- (instancetype)init {
    self = [super init];
    if (self) _instanceLock = -1;
    return self;
}

- (NSFileHandle *)openProcessLog {
    NSString *path = [self.dataDirectory stringByAppendingPathComponent:@"widget-process.log"];
    unsigned long long size = [[[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil] fileSize];
    if (size > 200000) rename(path.fileSystemRepresentation, [[path stringByAppendingString:@".previous"] fileSystemRepresentation]);
    int descriptor = open(path.fileSystemRepresentation, O_WRONLY | O_CREAT | O_APPEND, 0600);
    return descriptor < 0 ? [NSFileHandle fileHandleWithStandardError] : [[NSFileHandle alloc] initWithFileDescriptor:descriptor closeOnDealloc:YES];
}

- (dispatch_source_t)watchSignal:(int)signalNumber {
    signal(signalNumber, meterSignalHandler);
    dispatch_source_t source = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, signalNumber, 0, dispatch_get_main_queue());
    dispatch_source_set_event_handler(source, ^{ [NSApp terminate:nil]; });
    dispatch_resume(source);
    return source;
}

- (void)launchWidget {
    if (self.stopping || self.widget.running) return;
    self.processLog = [self openProcessLog];
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [[NSBundle mainBundle].bundleURL URLByAppendingPathComponent:@"Contents/Helpers/CodexUsageMeterMenuBar.app/Contents/MacOS/applet"];
    task.standardOutput = self.processLog;
    task.standardError = self.processLog;
    __weak MeterAppDelegate *owner = self;
    task.terminationHandler = ^(NSTask *finished) {
        int status = finished.terminationStatus;
        dispatch_async(dispatch_get_main_queue(), ^{
            MeterAppDelegate *app = owner;
            if (!app || app.stopping) return;
            NSString *entry = [NSString stringWithFormat:@"%@ widget exited: %d\n", [NSDate date], status];
            [app.processLog writeData:[entry dataUsingEncoding:NSUTF8StringEncoding]];
            app.widget = nil;
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ [owner launchWidget]; });
        });
    };
    self.widget = task;
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        self.widget = nil;
        NSString *entry = [NSString stringWithFormat:@"%@ Unable to launch widget: %@\n", [NSDate date], error.localizedDescription];
        [self.processLog writeData:[entry dataUsingEncoding:NSUTF8StringEncoding]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ [owner launchWidget]; });
    }
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    self.dataDirectory = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/CodexUsageMeter"];
    NSError *error = nil;
    if (![[NSFileManager defaultManager] createDirectoryAtPath:self.dataDirectory withIntermediateDirectories:YES attributes:nil error:&error]) {
        NSLog(@"Cannot open widget data directory: %@", error.localizedDescription);
        [NSApp terminate:nil];
        return;
    }
    NSString *lockPath = [self.dataDirectory stringByAppendingPathComponent:@"app-instance.lock"];
    self.instanceLock = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR | O_CLOEXEC, 0600);
    if (self.instanceLock < 0 || flock(self.instanceLock, LOCK_EX | LOCK_NB) != 0) {
        // Double-clicks and login launches must share a single menu-bar item.
        [NSApp terminate:nil];
        return;
    }
    self.terminationSignal = [self watchSignal:SIGTERM];
    self.interruptSignal = [self watchSignal:SIGINT];
    self.processLog = [self openProcessLog];
    NSTask *vpn = [[NSTask alloc] init];
    vpn.executableURL = [NSURL fileURLWithPath:@"/bin/zsh"];
    vpn.arguments = @[[[NSBundle mainBundle] pathForResource:@"maomaoyun-autoconnect" ofType:@"zsh"]];
    vpn.standardOutput = self.processLog;
    vpn.standardError = self.processLog;
    if ([vpn launchAndReturnError:&error]) self.vpn = vpn;
    [self launchWidget];
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    (void)sender;
    self.stopping = YES;
    if (self.widget.running) [self.widget terminate];
    if (self.vpn.running) [self.vpn terminate];
    return NSTerminateNow;
}
@end

int main(void) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
        __attribute__((objc_precise_lifetime)) MeterAppDelegate *delegate = [[MeterAppDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
