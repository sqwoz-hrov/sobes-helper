#import <ApplicationServices/ApplicationServices.h>
#import <Cocoa/Cocoa.h>
#include <node_api.h>
#include <stdbool.h>

static bool isDisconnected = false;
static id mouseMonitor = nil;
static double pendingDeltaX = 0;
static double pendingDeltaY = 0;

static void removeMouseMonitor(void) {
    if (!mouseMonitor) return;
    [NSEvent removeMonitor:mouseMonitor];
    mouseMonitor = nil;
    pendingDeltaX = 0;
    pendingDeltaY = 0;
}

static void reconnectCursor(void) {
    removeMouseMonitor();
    if (!isDisconnected) return;
    CGAssociateMouseAndMouseCursorPosition(true);
    isDisconnected = false;
}

static void installMouseMonitor(void) {
    if (mouseMonitor) return;

    const NSEventMask mask = NSEventMaskMouseMoved
        | NSEventMaskLeftMouseDragged
        | NSEventMaskRightMouseDragged
        | NSEventMaskOtherMouseDragged;

    mouseMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        pendingDeltaX += event.deltaX;
        pendingDeltaY += event.deltaY;
        return event;
    }];
}

static napi_value lockCursor(napi_env env, napi_callback_info info) {
    (void)info;

    installMouseMonitor();
    const CGError result = CGAssociateMouseAndMouseCursorPosition(false);
    if (result == kCGErrorSuccess) {
        isDisconnected = true;
    } else {
        removeMouseMonitor();
    }

    napi_value success;
    napi_get_boolean(env, result == kCGErrorSuccess, &success);
    return success;
}

static napi_value unlockCursor(napi_env env, napi_callback_info info) {
    (void)info;

    const CGError result = CGAssociateMouseAndMouseCursorPosition(true);
    isDisconnected = false;
    removeMouseMonitor();

    napi_value success;
    napi_get_boolean(env, result == kCGErrorSuccess, &success);
    return success;
}

static napi_value getMouseDelta(napi_env env, napi_callback_info info) {
    (void)info;

    const double deltaX = pendingDeltaX;
    const double deltaY = pendingDeltaY;
    pendingDeltaX = 0;
    pendingDeltaY = 0;

    napi_value result;
    napi_value x;
    napi_value y;
    napi_create_object(env, &result);
    napi_create_double(env, deltaX, &x);
    napi_create_double(env, deltaY, &y);
    napi_set_named_property(env, result, "x", x);
    napi_set_named_property(env, result, "y", y);
    return result;
}

static void cleanup(void *data) {
    (void)data;
    reconnectCursor();
}

NAPI_MODULE_INIT() {
    napi_value lockFunction;
    napi_value unlockFunction;
    napi_value getDeltaFunction;

    napi_create_function(env, "lock", NAPI_AUTO_LENGTH, lockCursor, NULL, &lockFunction);
    napi_create_function(env, "unlock", NAPI_AUTO_LENGTH, unlockCursor, NULL, &unlockFunction);
    napi_create_function(env, "getDelta", NAPI_AUTO_LENGTH, getMouseDelta, NULL, &getDeltaFunction);
    napi_set_named_property(env, exports, "lock", lockFunction);
    napi_set_named_property(env, exports, "unlock", unlockFunction);
    napi_set_named_property(env, exports, "getDelta", getDeltaFunction);
    napi_add_env_cleanup_hook(env, cleanup, NULL);

    return exports;
}
