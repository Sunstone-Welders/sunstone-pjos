// ============================================================================
// Obj-C registration for the Square Tap to Pay Capacitor plugin
// ios/App/App/Plugins/SquareTapToPay/SquareTapToPayPlugin.m
// ============================================================================
// Capacitor still uses the legacy CAP_PLUGIN macro for plugin registration,
// which is Obj-C only. This file declares the JS-facing method signatures so
// Capacitor's runtime can route calls into the Swift class.
// ============================================================================

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(SquareTapToPayPlugin, "SquareTapToPay",
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startPayment, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAuthorizationState, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(presentSettings, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(activateReader, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(dismissActivation, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(hasProximityReaderEntitlement, CAPPluginReturnPromise);
)
