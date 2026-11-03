#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <pthread.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <dirent.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <mach-o/dyld.h>
#include <libgen.h>

#define DEFAULT_PORT 5179

static int g_actual_port = DEFAULT_PORT;
static char g_html_path[2048] = {0};
static char g_save_dir[2048] = {0};
static long g_boot_time = 0;
static pthread_mutex_t g_dir_mutex = PTHREAD_MUTEX_INITIALIZER;

static void url_decode(const char *src, char *dst, size_t dst_size) {
    size_t di = 0;
    for (size_t si = 0; src[si] && di + 1 < dst_size; si++) {
        if (src[si] == '%' && src[si + 1] && src[si + 2]) {
            char hex[3] = { src[si + 1], src[si + 2], 0 };
            dst[di++] = (char)strtol(hex, NULL, 16);
            si += 2;
        } else if (src[si] == '+') {
            dst[di++] = ' ';
        } else if (src[si] == '/' || src[si] == '\\') {
            dst[di++] = '_';
        } else {
            dst[di++] = src[si];
        }
    }
    dst[di] = '\0';
}

static void *handle_client(void *arg) {
    @autoreleasepool {
        int client_fd = *(int *)arg;
        free(arg);

        int nosigpipe = 1;
        setsockopt(client_fd, SOL_SOCKET, SO_NOSIGPIPE, &nosigpipe, sizeof(nosigpipe));

        char header_buf[8192];
        ssize_t received = 0;
        ssize_t header_end = -1;

        while (received < (ssize_t)sizeof(header_buf) - 1) {
            ssize_t n = recv(client_fd, header_buf + received, sizeof(header_buf) - 1 - received, 0);
            if (n <= 0) break;
            received += n;
            header_buf[received] = '\0';
            char *p = strstr(header_buf, "\r\n\r\n");
            if (p) {
                header_end = (p - header_buf) + 4;
                break;
            }
        }

        if (header_end < 0) {
            close(client_fd);
            return NULL;
        }

        // 1. GET /__version
        if (strncmp(header_buf, "GET /__version", 14) == 0) {
            struct stat st;
            long mtime = 0, fsize_stat = 0;
            if (stat(g_html_path, &st) == 0) {
                mtime = (long)st.st_mtime;
                fsize_stat = (long)st.st_size;
            }
            char body[128];
            snprintf(body, sizeof(body), "%ld-%ld-%ld", mtime, fsize_stat, g_boot_time);
            char resp[320];
            snprintf(resp, sizeof(resp),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/plain; charset=utf-8\r\n"
                "Content-Length: %lu\r\n"
                "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
                "Connection: close\r\n\r\n%s", strlen(body), body);
            send(client_fd, resp, strlen(resp), 0);
            close(client_fd);
            return NULL;
        }

        // 2. GET /__pick_folder (Opens Native macOS NSOpenPanel Folder Picker safely)
        if (strncmp(header_buf, "GET /__pick_folder", 18) == 0) {
            __block char *b_path = NULL;
            __block char *b_name = NULL;

            dispatch_sync(dispatch_get_main_queue(), ^{
                @autoreleasepool {
                    NSOpenPanel *panel = [NSOpenPanel openPanel];
                    [panel setCanChooseFiles:NO];
                    [panel setCanChooseDirectories:YES];
                    [panel setCanCreateDirectories:YES];
                    [panel setAllowsMultipleSelection:NO];
                    [panel setPrompt:@"Select Output Folder"];
                    [panel setMessage:@"Choose a folder where SnapPro will automatically save exported photos:"];
                    [NSApp activateIgnoringOtherApps:YES];

                    if ([panel runModal] == NSModalResponseOK) {
                        NSURL *url = [[panel URLs] firstObject];
                        if (url && [url path]) {
                            NSString *pStr = [url path];
                            NSString *nStr = [pStr lastPathComponent];
                            const char *p = [pStr UTF8String];
                            const char *n = [nStr UTF8String];
                            if (p) b_path = strdup(p);
                            if (n) b_name = strdup(n);
                        }
                    }
                }
            });

            char json[4096];
            if (b_path && b_name) {
                pthread_mutex_lock(&g_dir_mutex);
                strncpy(g_save_dir, b_path, sizeof(g_save_dir) - 1);
                pthread_mutex_unlock(&g_dir_mutex);
                snprintf(json, sizeof(json), "{\"ok\":true,\"name\":\"%s\"}", b_name);
            } else {
                snprintf(json, sizeof(json), "{\"ok\":false}");
            }
            if (b_path) { free(b_path); b_path = NULL; }
            if (b_name) { free(b_name); b_name = NULL; }

            char resp[512];
            snprintf(resp, sizeof(resp),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json; charset=utf-8\r\n"
                "Content-Length: %lu\r\n"
                "Cache-Control: no-store\r\n"
                "Connection: close\r\n\r\n", strlen(json));
            send(client_fd, resp, strlen(resp), 0);
            send(client_fd, json, strlen(json), 0);
            close(client_fd);
            return NULL;
        }

        // 2.5 GET /__list_files (Fast native listing of all existing files in output folder)
        if (strncmp(header_buf, "GET /__list_files", 17) == 0) {
            char dir_copy[2048] = {0};
            pthread_mutex_lock(&g_dir_mutex);
            strncpy(dir_copy, g_save_dir, sizeof(dir_copy) - 1);
            pthread_mutex_unlock(&g_dir_mutex);

            size_t cap = 65536;
            size_t len = 0;
            char *json = malloc(cap);
            if (!json) {
                const char *err = "HTTP/1.1 500 Internal Error\r\n\r\n";
                send(client_fd, err, strlen(err), 0);
                close(client_fd);
                return NULL;
            }
            strcpy(json, "{\"files\":[");
            len = strlen(json);

            if (dir_copy[0]) {
                DIR *d = opendir(dir_copy);
                if (d) {
                    struct dirent *ent;
                    int first = 1;
                    while ((ent = readdir(d)) != NULL) {
                        if (ent->d_name[0] == '.') continue;
                        size_t nlen = strlen(ent->d_name);
                        if (len + nlen + 16 > cap) {
                            cap *= 2;
                            char *new_json = realloc(json, cap);
                            if (!new_json) break;
                            json = new_json;
                        }
                        if (!first) json[len++] = ',';
                        first = 0;
                        json[len++] = '"';
                        for (size_t k = 0; k < nlen; k++) {
                            if (ent->d_name[k] == '"' || ent->d_name[k] == '\\') json[len++] = '\\';
                            json[len++] = ent->d_name[k];
                        }
                        json[len++] = '"';
                    }
                    closedir(d);
                }
            }
            json[len++] = ']';
            json[len++] = '}';
            json[len] = '\0';

            char resp[384];
            snprintf(resp, sizeof(resp),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json; charset=utf-8\r\n"
                "Content-Length: %zu\r\n"
                "Cache-Control: no-store\r\n"
                "Connection: close\r\n\r\n", len);
            send(client_fd, resp, strlen(resp), 0);
            send(client_fd, json, len, 0);
            free(json);
            close(client_fd);
            return NULL;
        }

        // 2.6 GET /__file_exists?name=...
        if (strncmp(header_buf, "GET /__file_exists", 18) == 0) {
            char raw_name[512] = "";
            char *q = strstr(header_buf, "name=");
            if (q) {
                q += 5;
                size_t i = 0;
                while (q[i] && q[i] != ' ' && q[i] != '&' && q[i] != '\r' && i + 1 < sizeof(raw_name)) {
                    raw_name[i] = q[i];
                    i++;
                }
                raw_name[i] = '\0';
            }
            char clean_name[512];
            url_decode(raw_name, clean_name, sizeof(clean_name));

            char full_path[4096] = {0};
            pthread_mutex_lock(&g_dir_mutex);
            if (g_save_dir[0]) {
                snprintf(full_path, sizeof(full_path), "%s/%s", g_save_dir, clean_name);
            }
            pthread_mutex_unlock(&g_dir_mutex);

            struct stat st;
            int exists = (full_path[0] && stat(full_path, &st) == 0) ? 1 : 0;
            char body[64];
            snprintf(body, sizeof(body), "{\"exists\":%s}", exists ? "true" : "false");
            char resp[256];
            snprintf(resp, sizeof(resp),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json\r\n"
                "Content-Length: %zu\r\n"
                "Cache-Control: no-store\r\n"
                "Connection: close\r\n\r\n%s", strlen(body), body);
            send(client_fd, resp, strlen(resp), 0);
            close(client_fd);
            return NULL;
        }

        // 3. POST /__save_file?name=... (Direct Native C Disk Writer — Zero .crswap!)
        if (strncmp(header_buf, "POST /__save_file", 17) == 0) {
            char raw_name[512] = "capture.jpg";
            char *q = strstr(header_buf, "name=");
            if (q) {
                q += 5;
                size_t i = 0;
                while (q[i] && q[i] != ' ' && q[i] != '&' && q[i] != '\r' && i + 1 < sizeof(raw_name)) {
                    raw_name[i] = q[i];
                    i++;
                }
                raw_name[i] = '\0';
            }
            char clean_name[512];
            url_decode(raw_name, clean_name, sizeof(clean_name));

            long content_len = 0;
            char *cl = strcasestr(header_buf, "Content-Length:");
            if (cl) {
                content_len = atol(cl + 15);
            }

            char full_path[4096] = {0};
            pthread_mutex_lock(&g_dir_mutex);
            if (g_save_dir[0]) {
                snprintf(full_path, sizeof(full_path), "%s/%s", g_save_dir, clean_name);
            }
            pthread_mutex_unlock(&g_dir_mutex);

            FILE *out = full_path[0] ? fopen(full_path, "wb") : NULL;
            long body_already = received - header_end;
            if (out && body_already > 0) {
                fwrite(header_buf + header_end, 1, body_already, out);
            }

            long remaining = content_len - body_already;
            char chunk[65536];
            while (remaining > 0) {
                ssize_t to_read = remaining > (long)sizeof(chunk) ? sizeof(chunk) : remaining;
                ssize_t n = recv(client_fd, chunk, to_read, 0);
                if (n <= 0) break;
                if (out) fwrite(chunk, 1, n, out);
                remaining -= n;
            }
            if (out) fclose(out);

            const char *ok_resp =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json\r\n"
                "Content-Length: 11\r\n"
                "Connection: close\r\n\r\n{\"ok\":true}";
            send(client_fd, ok_resp, strlen(ok_resp), 0);
            close(client_fd);
            return NULL;
        }

        // 4. Default: Serve index.html
        FILE *f = fopen(g_html_path, "rb");
        if (!f) {
            const char *nf = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found";
            send(client_fd, nf, strlen(nf), 0);
            close(client_fd);
            return NULL;
        }
        fseek(f, 0, SEEK_END);
        long fsize = ftell(f);
        fseek(f, 0, SEEK_SET);

        char *buf = malloc(fsize);
        if (buf) {
            fread(buf, 1, fsize, f);
            char header[320];
            snprintf(header, sizeof(header),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/html; charset=utf-8\r\n"
                "Content-Length: %ld\r\n"
                "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
                "Pragma: no-cache\r\n"
                "Expires: 0\r\n"
                "Connection: close\r\n\r\n", fsize);
            send(client_fd, header, strlen(header), 0);
            long sent = 0;
            while (sent < fsize) {
                ssize_t n = send(client_fd, buf + sent, fsize - sent, 0);
                if (n <= 0) break;
                sent += n;
            }
            free(buf);
        }
        fclose(f);
        close(client_fd);
        return NULL;
    }
}

static void *server_thread(void *arg) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) return NULL;

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    int bound = 0;
    for (int p = DEFAULT_PORT; p <= DEFAULT_PORT + 20; p++) {
        addr.sin_port = htons(p);
        if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
            g_actual_port = p;
            bound = 1;
            break;
        }
    }

    if (!bound) {
        addr.sin_port = htons(0);
        if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
            socklen_t len = sizeof(addr);
            if (getsockname(server_fd, (struct sockaddr *)&addr, &len) == 0) {
                g_actual_port = ntohs(addr.sin_port);
                bound = 1;
            }
        }
    }

    if (!bound) {
        close(server_fd);
        return NULL;
    }
    if (listen(server_fd, 64) < 0) {
        close(server_fd);
        return NULL;
    }

    signal(SIGPIPE, SIG_IGN);

    while (1) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;
        int *pclient = malloc(sizeof(int));
        *pclient = client_fd;
        pthread_t tid;
        pthread_create(&tid, NULL, handle_client, pclient);
        pthread_detach(tid);
    }
    return NULL;
}

@interface SnapProDelegate : NSObject <NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate>
@property (strong, nonatomic) NSWindow *window;
@property (strong, nonatomic) WKWebView *webView;
@end

@implementation SnapProDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    // 1. Prevent macOS App Nap & idle system sleep so background/minimized processing runs at 100% full speed!
    [[NSProcessInfo processInfo] beginActivityWithOptions:(NSActivityUserInitiated | NSActivityLatencyCritical | NSActivityIdleSystemSleepDisabled)
                                                  reason:@"SnapPro High-Performance Video Batch Processing"];

    NSRect frame = NSMakeRect(0, 0, 1400, 860);
    NSUInteger style = NSWindowStyleMaskTitled |
                       NSWindowStyleMaskClosable |
                       NSWindowStyleMaskMiniaturizable |
                       NSWindowStyleMaskResizable;

    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:style
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window setTitle:@"SnapPro — Pro Video Frame Studio"];
    [self.window setAppearance:[NSAppearance appearanceNamed:NSAppearanceNameDarkAqua]];
    [self.window setBackgroundColor:[NSColor colorWithSRGBRed:0.035 green:0.043 blue:0.063 alpha:1.0]];
    [self.window setMinSize:NSMakeSize(980, 640)];
    [self.window center];

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    [config.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];
    [config.preferences setValue:@YES forKey:@"developerExtrasEnabled"];
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;

    self.webView = [[WKWebView alloc] initWithFrame:[[self.window contentView] bounds] configuration:config];
    [self.webView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
    [self.webView setUIDelegate:self];
    [self.webView setNavigationDelegate:self];
    [self.webView setValue:@NO forKey:@"drawsBackground"];

    [[self.window contentView] addSubview:self.webView];

    NSString *urlStr = [NSString stringWithFormat:@"http://127.0.0.1:%d/?native=%ld", g_actual_port, g_boot_time];
    NSURLRequest *req = [NSURLRequest requestWithURL:[NSURL URLWithString:urlStr]
                                         cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                     timeoutInterval:30.0];
    [self.webView loadRequest:req];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)reloadPage:(id)sender {
    [self.webView reloadFromOrigin];
}

// Native macOS File Picker for <input type="file" multiple> & <input webkitdirectory>
- (void)webView:(WKWebView *)webView
runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
initiatedByFrame:(WKFrameInfo *)frame
completionHandler:(void (^)(NSArray<NSURL *> * _Nullable))completionHandler {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    BOOL pickDirs = [parameters allowsDirectories];
    [panel setCanChooseFiles:!pickDirs];
    [panel setCanChooseDirectories:pickDirs];
    [panel setAllowsMultipleSelection:YES]; // Always allow Cmd+A and multiple selection!
    [panel setResolvesAliases:YES];
    [panel setPrompt:pickDirs ? @"Select Folder" : @"Select Videos"];
    
    [panel beginWithCompletionHandler:^(NSModalResponse result) {
        if (result == NSModalResponseOK) {
            completionHandler([panel URLs]);
        } else {
            completionHandler(nil);
        }
    }];
}

@end

static void setup_macos_menu(SnapProDelegate *delegate) {
    NSMenu *menubar = [[NSMenu alloc] init];

    // 1. App Menu
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:appMenuItem];

    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"About SnapPro" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *reloadItem = [[NSMenuItem alloc] initWithTitle:@"Reload Studio" action:@selector(reloadPage:) keyEquivalent:@"r"];
    [reloadItem setTarget:delegate];
    [appMenu addItem:reloadItem];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Hide SnapPro" action:@selector(hide:) keyEquivalent:@"h"];
    [appMenu addItemWithTitle:@"Quit SnapPro" action:@selector(terminate:) keyEquivalent:@"q"];
    [appMenuItem setSubmenu:appMenu];

    // 2. Edit Menu (Crucial for Cmd+A Select All, Cmd+C, Cmd+V in Cocoa and NSOpenPanel)
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:editMenuItem];

    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    [editMenuItem setSubmenu:editMenu];

    // 3. Window Menu
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:windowMenuItem];

    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:[NSMenuItem separatorItem]];
    [windowMenu addItemWithTitle:@"Bring All to Front" action:@selector(arrangeInFront:) keyEquivalent:@""];
    [windowMenuItem setSubmenu:windowMenu];

    [NSApp setMainMenu:menubar];
}

int main(int argc, const char *argv[]) {
    signal(SIGPIPE, SIG_IGN);
    @autoreleasepool {
        char exe_path[2048];
        uint32_t size = sizeof(exe_path);
        if (_NSGetExecutablePath(exe_path, &size) != 0) return 1;

        char real_exe[2048];
        if (!realpath(exe_path, real_exe)) strncpy(real_exe, exe_path, sizeof(real_exe));

        char *dir = dirname(real_exe);
        snprintf(g_html_path, sizeof(g_html_path), "%s/../Resources/index.html", dir);
        g_boot_time = (long)time(NULL);

        // Free port 5179 if held by an older daemon
        system("/usr/sbin/lsof -ti :5179 | /usr/bin/xargs kill -9 >/dev/null 2>&1");
        usleep(60000);

        pthread_t stid;
        pthread_create(&stid, NULL, server_thread, NULL);
        pthread_detach(stid);
        usleep(60000);

        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];

        SnapProDelegate *delegate = [[SnapProDelegate alloc] init];
        [app setDelegate:delegate];
        setup_macos_menu(delegate);

        [app run];
    }
    return 0;
}
