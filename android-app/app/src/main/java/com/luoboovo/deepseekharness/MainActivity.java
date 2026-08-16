package com.luoboovo.deepseekharness;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import java.util.Locale;
import java.util.regex.Pattern;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends ComponentActivity {
    private static final String START_PAGE = "file:///android_asset/connect.html";
    private static final int DEFAULT_PORT = 3081;
    private static final Pattern HOST_PATTERN = Pattern.compile("^[A-Za-z0-9.-]{1,253}$");
    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-HJ-NP-Z2-9]{8}$");

    private WebView webView;
    private ProgressBar progressBar;
    private SharedPreferences preferences;
    private String connectedOrigin;
    private OnBackPressedCallback backCallback;
    private GmsBarcodeScanner barcodeScanner;
    private boolean connectionBridgeAttached;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(247, 249, 252));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        GmsBarcodeScannerOptions scannerOptions = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build();
        barcodeScanner = GmsBarcodeScanning.getClient(this, scannerOptions);

        preferences = getSharedPreferences("connection", MODE_PRIVATE);
        createWebView();
        backCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                loadConnectionPage(null);
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
        if (!handleDeepLink(getIntent())) loadConnectionPage(null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!handleDeepLink(intent)) loadConnectionPage(null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.rgb(37, 99, 235)));

        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        );
        root.addView(progressBar, progressParams);
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " DeepSeekHarnessMobile/1.3.1");

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(view, request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.requestFocus(View.FOCUS_DOWN);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && connectedOrigin != null) {
                    loadConnectionPage("无法连接电脑，请检查地址和局域网状态。");
                }
            }

            @Override
            public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
            ) {
                if (!request.isForMainFrame()) return;
                if (errorResponse.getStatusCode() == 401) {
                    loadConnectionPage("配对码无效，请在电脑端重新确认。");
                } else if (errorResponse.getStatusCode() >= 500) {
                    loadConnectionPage("电脑端 Harness 暂时不可用。");
                }
            }
        });
    }

    private boolean handleNavigation(WebView view, Uri uri) {
        if (("harness".equals(uri.getScheme()) || "deepseekharness".equals(uri.getScheme()))
            && "connect".equals(uri.getHost())) {
            connect(uri.getQueryParameter("host"), uri.getQueryParameter("code"), parsePort(uri.getQueryParameter("port")));
            return true;
        }

        String url = uri.toString();
        if (url.startsWith(START_PAGE)) return false;
        if (connectedOrigin != null && url.startsWith(connectedOrigin)) return false;

        if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException exception) {
                Toast.makeText(this, "没有可打开该链接的应用", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        return true;
    }

    private boolean handleDeepLink(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !"deepseekharness".equals(uri.getScheme()) || !"connect".equals(uri.getHost())) {
            return false;
        }
        connect(uri.getQueryParameter("host"), uri.getQueryParameter("code"), parsePort(uri.getQueryParameter("port")));
        return true;
    }

    private void startQrScan() {
        barcodeScanner.startScan()
            .addOnSuccessListener(barcode -> handleScannedValue(barcode.getRawValue()))
            .addOnFailureListener(error -> Toast.makeText(
                this,
                "扫码暂时不可用，请手动输入电脑地址和配对码。",
                Toast.LENGTH_LONG
            ).show());
    }

    private void handleScannedValue(String rawValue) {
        if (rawValue == null || rawValue.trim().isEmpty()) {
            loadConnectionPage("二维码内容为空。");
            return;
        }

        Uri uri = Uri.parse(rawValue.trim());
        String scheme = uri.getScheme();
        if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) && uri.getHost() != null) {
            String code = uri.getQueryParameter("token");
            if (code == null) code = uri.getQueryParameter("code");
            connect(uri.getHost(), code, uri.getPort() > 0 ? uri.getPort() : DEFAULT_PORT);
            return;
        }
        if ("deepseekharness".equalsIgnoreCase(scheme) && "connect".equals(uri.getHost())) {
            connect(uri.getQueryParameter("host"), uri.getQueryParameter("code"), parsePort(uri.getQueryParameter("port")));
            return;
        }
        loadConnectionPage("这不是 DeepSeek Harness 配对二维码。");
    }

    private int parsePort(String value) {
        if (value == null || value.isEmpty()) return DEFAULT_PORT;
        try {
            int port = Integer.parseInt(value);
            return port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
        } catch (NumberFormatException exception) {
            return DEFAULT_PORT;
        }
    }

    private void connect(String rawHost, String rawCode, int port) {
        String host = rawHost == null ? "" : rawHost.trim().toLowerCase(Locale.ROOT);
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        if (!HOST_PATTERN.matcher(host).matches()) {
            loadConnectionPage("电脑地址格式不正确。");
            return;
        }
        if (!CODE_PATTERN.matcher(code).matches()) {
            loadConnectionPage("配对码应为 8 位字符。");
            return;
        }

        int safePort = port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
        preferences.edit()
            .putString("host", host)
            .putString("code", code)
            .putInt("port", safePort)
            .apply();
        connectedOrigin = "http://" + host + ":" + safePort;
        backCallback.setEnabled(true);
        detachConnectionBridge();
        webView.loadUrl(connectedOrigin + "/?mobile=1&token=" + Uri.encode(code));
    }

    private void loadConnectionPage(String error) {
        connectedOrigin = null;
        if (backCallback != null) backCallback.setEnabled(false);
        attachConnectionBridge();
        String host = preferences.getString("host", "");
        String code = preferences.getString("code", "");
        Uri.Builder builder = Uri.parse(START_PAGE).buildUpon()
            .appendQueryParameter("host", host)
            .appendQueryParameter("code", code);
        if (error != null && !error.isEmpty()) builder.appendQueryParameter("error", error);
        webView.loadUrl(builder.build().toString());
    }

    @SuppressLint("AddJavascriptInterface")
    private void attachConnectionBridge() {
        if (connectionBridgeAttached) return;
        webView.addJavascriptInterface(new ConnectionBridge(), "AndroidClient");
        connectionBridgeAttached = true;
    }

    private void detachConnectionBridge() {
        if (!connectionBridgeAttached) return;
        webView.removeJavascriptInterface("AndroidClient");
        connectionBridgeAttached = false;
    }

    private final class ConnectionBridge {
        @JavascriptInterface
        public void scanQr() {
            runOnUiThread(MainActivity.this::startQrScan);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            detachConnectionBridge();
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
