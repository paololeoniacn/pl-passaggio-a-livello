<?php
/**
 * Fallback proxy for Alwaysdata (free PHP hosting, EU datacenter, non-hyperscaler IP).
 * Deploy this file to your Alwaysdata account if Fly.io is blocked by Imperva WAF.
 *
 * Usage: set PROXY_URL = "https://your-account.alwaysdata.net/proxy.php" in wrangler.toml
 * Auth:  set PROXY_SECRET in .dev.vars / wrangler secret put, and in Alwaysdata env vars.
 */

$secret = getenv('PROXY_SECRET');
if (!$secret) {
    http_response_code(500);
    exit('Server misconfiguration: PROXY_SECRET not set');
}

if (($_SERVER['HTTP_X_PROXY_SECRET'] ?? '') !== $secret) {
    http_response_code(401);
    exit('Unauthorized');
}

$url = $_GET['url'] ?? '';
if (!str_starts_with($url, 'http://www.viaggiatreno.it/')) {
    http_response_code(403);
    exit('Forbidden: only viaggiatreno.it URLs are allowed');
}

$context = stream_context_create([
    'http' => [
        'header' => implode("\r\n", [
            'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer: http://www.viaggiatreno.it/',
        ]),
        'ignore_errors' => true,
    ],
]);

$body = @file_get_contents($url, false, $context);
if ($body === false) {
    http_response_code(502);
    exit('Bad Gateway: upstream fetch failed');
}

// Forward upstream status code
$status = 200;
foreach ($http_response_header as $h) {
    if (preg_match('/^HTTP\/\S+\s+(\d+)/', $h, $m)) {
        $status = (int) $m[1];
    }
}

http_response_code($status);
header('Content-Type: application/json');
echo $body;
