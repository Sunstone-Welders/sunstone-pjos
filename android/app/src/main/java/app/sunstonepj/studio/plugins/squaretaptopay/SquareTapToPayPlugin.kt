// ============================================================================
// SquareTapToPayPlugin — Capacitor bridge to Square's Mobile Payments SDK
// android/app/src/main/java/app/sunstonepj/studio/plugins/squaretaptopay/SquareTapToPayPlugin.kt
// ============================================================================
// Exposes 4 methods to the web layer:
//   initialize, isAvailable, startPayment, getAuthorizationState
//
// SDK reference:
//   https://developer.squareup.com/docs/mobile-payments-sdk/android
//
// The Mobile Payments SDK requires API 28+ — see android/variables.gradle.
// Dependency is declared in android/app/build.gradle.
// ============================================================================

package app.sunstonepj.studio.plugins.squaretaptopay

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.squareup.sdk.mobilepayments.MobilePaymentsSdk
import com.squareup.sdk.mobilepayments.authorization.AuthorizeErrorCode
import com.squareup.sdk.mobilepayments.core.Result
import com.squareup.sdk.mobilepayments.payment.CurrencyCode
import com.squareup.sdk.mobilepayments.payment.Money
import com.squareup.sdk.mobilepayments.payment.OnlinePayment
import com.squareup.sdk.mobilepayments.payment.PaymentParameters
import com.squareup.sdk.mobilepayments.payment.PromptMode
import com.squareup.sdk.mobilepayments.payment.PromptParameters
import com.squareup.sdk.mobilepayments.payment.PaymentParameters.ProcessingMode
import java.util.UUID

@CapacitorPlugin(name = "SquareTapToPay")
class SquareTapToPayPlugin : Plugin() {

    companion object {
        /** Square's SDK requires a one-time process-lifetime initialize call. */
        @Volatile
        private var sdkInitialized = false
    }

    // ── initialize ──────────────────────────────────────────────────────────

    @PluginMethod
    fun initialize(call: PluginCall) {
        val accessToken = call.getString("accessToken")
        val locationId = call.getString("locationId")
        val applicationId = call.getString("applicationId")
        if (accessToken.isNullOrBlank() || locationId.isNullOrBlank()) {
            call.reject("accessToken and locationId are required")
            return
        }
        if (applicationId.isNullOrBlank()) {
            call.reject("applicationId is required on Android. Set SQUARE_APPLICATION_ID in the server environment.")
            return
        }

        // The Mobile Payments SDK requires a one-time process-wide initialize
        // before any other call. Square docs recommend doing this in your
        // Application class — we do it lazily here so consumers don't have to
        // create a custom Application class. Guarded so we only do it once.
        if (!sdkInitialized) {
            try {
                MobilePaymentsSdk.initialize(applicationId, activity.application)
                sdkInitialized = true
            } catch (e: Throwable) {
                call.reject("Square SDK initialize failed: ${e.message}")
                return
            }
        }

        val authManager = MobilePaymentsSdk.authorizationManager()

        // Calling authorize() when already authorized is a no-op success in
        // the SDK; we don't pre-check state.
        authManager.authorize(accessToken, locationId) { result ->
            when (result) {
                is Result.Success -> call.resolve()
                is Result.Failure -> {
                    val message = when (result.errorCode) {
                        AuthorizeErrorCode.NO_NETWORK ->
                            "No network connection. Try again when online."
                        AuthorizeErrorCode.USAGE_ERROR ->
                            "Invalid Square credentials. Reconnect Square in Settings."
                        else -> result.errorMessage ?: "Square authorization failed."
                    }
                    call.reject(message)
                }
            }
        }
    }

    // ── isAvailable ─────────────────────────────────────────────────────────

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        // The Mobile Payments SDK does not expose a direct "Tap to Pay
        // available" probe on Android — availability surfaces when you start
        // a payment and the prompt enumerates supported methods. As a
        // practical proxy here, we treat the device as available if the
        // SDK reports it can read settings (i.e. it's initialized). The
        // service layer surfaces a clearer error from startPayment if the
        // device actually can't accept Tap to Pay.
        val ready = try {
            MobilePaymentsSdk.settingsManager() // throws if not initialized
            true
        } catch (_: Throwable) {
            false
        }
        val res = JSObject().apply { put("available", ready) }
        call.resolve(res)
    }

    // ── getAuthorizationState ───────────────────────────────────────────────

    @PluginMethod
    fun getAuthorizationState(call: PluginCall) {
        val authorized = try {
            MobilePaymentsSdk.authorizationManager().authorizationState.isAuthorized
        } catch (_: Throwable) {
            false
        }
        val res = JSObject().apply { put("authorized", authorized) }
        call.resolve(res)
    }

    // ── startPayment ────────────────────────────────────────────────────────

    @PluginMethod
    fun startPayment(call: PluginCall) {
        val amountCents = call.getInt("amountCents")
        val currencyCode = call.getString("currencyCode") ?: "USD"
        val note = call.getString("note")

        if (amountCents == null || amountCents <= 0) {
            call.reject("amountCents must be a positive integer")
            return
        }

        val currency = try {
            CurrencyCode.valueOf(currencyCode.uppercase())
        } catch (_: IllegalArgumentException) {
            call.reject("Unsupported currency: $currencyCode")
            return
        }

        val paymentManager = MobilePaymentsSdk.paymentManager()

        val params = PaymentParameters.Builder(
            amount = Money(amountCents.toLong(), currency),
            idempotencyKey = UUID.randomUUID().toString()
        )
            .processingMode(ProcessingMode.ONLINE_ONLY)
            .apply { if (!note.isNullOrBlank()) note(note) }
            .build()

        val promptParams = PromptParameters(
            mode = PromptMode.DEFAULT,
            additionalPaymentMethods = emptyList()
        )

        // Square presents its own Activity. The callback fires on the same
        // host activity, which is bridge.activity (our MainActivity).
        bridge.activity.runOnUiThread {
            paymentManager.startPaymentActivity(params, promptParams) { result ->
                when (result) {
                    is Result.Success -> {
                        val payment = result.value
                        val response = JSObject().apply {
                            put("status", "success")
                            put("transactionId", payment.id ?: "")
                            put("clientTransactionId", payment.localId ?: "")
                            if (payment is OnlinePayment) {
                                val card = payment.sourceType?.card
                                if (card != null) {
                                    put("cardBrand", card.brand?.name ?: "")
                                    put("last4", card.last4 ?: "")
                                }
                            }
                        }
                        call.resolve(response)
                    }
                    is Result.Failure -> {
                        val cancelled = result.errorCode?.toString()
                            ?.contains("CANCEL", ignoreCase = true) == true
                        val response = JSObject().apply {
                            put("status", if (cancelled) "cancelled" else "error")
                            if (!cancelled) {
                                put(
                                    "errorMessage",
                                    result.errorMessage ?: "Payment could not be completed."
                                )
                            }
                        }
                        call.resolve(response)
                    }
                }
            }
        }
    }
}
