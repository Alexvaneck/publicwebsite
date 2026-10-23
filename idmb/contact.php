<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, string $message): never
{
    http_response_code($status);
    if (str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json')) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => $status === 200, 'message' => $message]);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        $text = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
        echo '<title>Contact — Vastgoedgroep</title><main><h1>Uw bericht</h1><p>' . $text . '</p>';
        echo '<p><a href="/idmb/contact/">Terug naar het contactformulier</a></p></main></html>';
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, 'Versturen kan alleen via het contactformulier.');
}

// Browser form submissions must originate on this website.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$originParts = parse_url($origin);
$authority = is_array($originParts) ? ($originParts['host'] ?? '') : '';
if (is_array($originParts) && isset($originParts['port'])) {
    $authority .= ':' . $originParts['port'];
}
if (!in_array($originParts['scheme'] ?? '', ['http', 'https'], true)
    || strcasecmp($authority, $_SERVER['HTTP_HOST'] ?? '') !== 0
    || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    respond(403, 'Versturen is alleen mogelijk vanaf onze website. Open het formulier opnieuw.');
}

$values = [];
foreach (['name', 'email', 'message', 'website'] as $field) {
    if (!isset($_POST[$field]) || !is_string($_POST[$field])) {
        respond(422, 'Versturen is niet gelukt. Vul uw naam, e-mailadres en bericht in.');
    }
    $values[$field] = trim($_POST[$field]);
}
if ($values['website'] !== '') {
    respond(422, 'Versturen is niet gelukt. Ongewenste inzending gedetecteerd.');
}
if ($values['name'] === '' || preg_match_all('/./us', $values['name']) === false
    || preg_match_all('/./us', $values['name']) > 100
    || preg_match('/[\x00-\x1F\x7F]/', $values['name'])
    || strlen($values['email']) > 254
    || !filter_var($values['email'], FILTER_VALIDATE_EMAIL)
    || preg_match('/[\r\n\x00]/', $values['email'])
    || $values['message'] === '' || preg_match_all('/./us', $values['message']) === false
    || preg_match_all('/./us', $values['message']) > 5000
    || str_contains($values['message'], "\0")) {
    respond(422, 'Versturen is niet gelukt. Controleer uw naam, e-mailadres en bericht (maximaal 5000 tekens).');
}

session_name('idmb_contact');
if (!session_start(['cookie_httponly' => true, 'cookie_secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'cookie_samesite' => 'Strict', 'cookie_path' => '/idmb/'])) {
    error_log('IDMB contact: session storage unavailable.');
    respond(503, 'Versturen is tijdelijk niet mogelijk. Mail ons via info@speebeheer.nl.');
}
if (time() - ($_SESSION['last_contact_attempt'] ?? 0) < 60) {
    header('Retry-After: 60');
    session_write_close();
    respond(429, 'Versturen kan maximaal eenmaal per minuut. Wacht even en probeer het opnieuw.');
}
$_SESSION['last_contact_attempt'] = time();
session_write_close();

$body = "Naam: {$values['name']}\nE-mailadres: {$values['email']}\n\n{$values['message']}\n";
$headers = [
    'From' => 'Vastgoedgroep website <noreply@alexvaneck.nl>',
    'Reply-To' => $values['email'],
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => '8bit',
];
try {
    $sent = mail('info@speebeheer.nl', 'Nieuw bericht via de Vastgoedgroep-website', $body, $headers);
} catch (Throwable $error) {
    error_log('IDMB contact: mail transport error: ' . $error->getMessage());
    respond(503, 'Versturen is niet gelukt. Probeer het later opnieuw of mail ons via info@speebeheer.nl.');
}
if (!$sent) {
    error_log('IDMB contact: mail transport rejected the message.');
    respond(503, 'Versturen is niet gelukt. Probeer het later opnieuw of mail ons via info@speebeheer.nl.');
}
respond(200, 'Bedankt voor uw bericht. Wij hebben het aangeboden voor verzending en nemen graag contact met u op.');
