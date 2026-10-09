package com.tomblack.endlessspace;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Below this smallest width (dp) it's a phone: held upright. Tablets, foldables opened out and Chromebooks turn freely. */
    private static final int LARGE_SCREEN_DP = 600;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the status and navigation bars on every Android version, not
        // only 15+; the game keeps clear of them with the safe-area insets.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        holdUprightOnPhones(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        holdUprightOnPhones(newConfig); // a foldable folding or opening
    }

    /** Portrait on phones only: the manifest no longer locks it, so large screens aren't restricted. */
    private void holdUprightOnPhones(Configuration config) {
        boolean phone = config.smallestScreenWidthDp < LARGE_SCREEN_DP;
        int want = phone ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        if (getRequestedOrientation() != want) setRequestedOrientation(want);
    }
}
