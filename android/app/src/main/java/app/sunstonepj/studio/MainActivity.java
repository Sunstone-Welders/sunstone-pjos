package app.sunstonepj.studio;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.sunstonepj.studio.plugins.squaretaptopay.SquareTapToPayPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register local Capacitor plugins before super.onCreate so the bridge
        // sees them when wiring up the JS surface.
        registerPlugin(SquareTapToPayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
