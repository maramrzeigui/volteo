<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paiement sécurisé · Volteo</title>
<style>
  :root { --fond:#0D0D10; --carte:#17171B; --bord:#2A2A31; --texte:#F5F5F7; --doux:#A1A1AA; --rouge:#E5545F; --rougeF:#B83A46; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px 16px; background: radial-gradient(600px 400px at 100% 0, #E5545F26, transparent 70%), var(--fond);
    color:var(--texte); font: 16px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; }
  main { width:100%; max-width:440px; }
  .test { padding:10px 14px; border-radius:14px; background:#3A2A12; color:#F6D58B; font-size:13px; margin-bottom:16px; }
  .test b { color:#fff; }
  .boite { background:var(--carte); border:1px solid var(--bord); border-radius:26px; padding:26px 22px; box-shadow:0 30px 80px #000a; }
  .marchand { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
  .logo { width:44px; height:44px; border-radius:14px; display:grid; place-items:center; background:linear-gradient(145deg,#E5737D,#A8323E); font-size:22px; }
  .marchand small { display:block; color:var(--doux); font-size:13px; }
  .montant { font-size:38px; font-weight:800; letter-spacing:-1px; margin:4px 0 18px; }
  .montant span { font-size:18px; color:var(--doux); font-weight:600; }
  label { display:block; font-size:13px; font-weight:700; color:var(--doux); margin:14px 0 6px; }
  input { width:100%; height:52px; border-radius:14px; border:1px solid var(--bord); background:#1E1E23; color:var(--texte); padding:0 16px; font-size:17px; letter-spacing:.5px; }
  input:focus { outline:none; border-color:var(--rouge); }
  .deux { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .reseaux { display:flex; gap:8px; margin-top:10px; }
  .reseaux span { padding:4px 10px; border-radius:8px; background:#26262B; font-size:12px; font-weight:800; color:#D4D4DA; }
  button { width:100%; height:56px; border:0; border-radius:16px; font:inherit; font-weight:800; font-size:17px; cursor:pointer; margin-top:20px; }
  .payer { background:var(--rougeF); color:#fff; }
  .annuler { background:transparent; color:var(--doux); margin-top:8px; height:44px; }
  .securite { text-align:center; color:#6B6B75; font-size:12px; margin-top:16px; }
  .portefeuille { text-align:center; padding:10px 0; }
  .portefeuille .icone { width:72px; height:72px; margin:0 auto 10px; border-radius:22px; display:grid; place-items:center; font-size:34px; background:#22222A; }
  table { width:100%; font-size:12px; color:#D4D4DA; border-collapse:collapse; margin-top:6px; }
  td { padding:2px 0; } td:first-child { font-family:ui-monospace,monospace; }
</style>
</head>
<body>
<main>
  <div class="test"><b>Mode test</b> — aucun débit réel. Les vraies cartes passent par ClicToPay, Flouci ou Konnect dès que leurs accès sont configurés.
    @if ($t->moyen === 'carte')
    <table>
      <tr><td>4111 1111 1111 1111</td><td>Visa · acceptée</td></tr>
      <tr><td>5555 5555 5555 4444</td><td>Mastercard · acceptée</td></tr>
      <tr><td>4000 0000 0000 0002</td><td>refusée (fonds insuffisants)</td></tr>
    </table>
    @endif
  </div>
  <form class="boite" method="post" action="{{ request()->fullUrl() }}">
    @csrf
    <div class="marchand"><div class="logo">⚡</div><div><strong>Volteo</strong><small>{{ $libelle }} · paiement sécurisé</small></div></div>
    <div class="montant">{{ number_format($t->montant, 3, ',', ' ') }} <span>DT</span></div>

    @if ($t->moyen === 'carte')
      <label for="carte">Numéro de carte</label>
      <input id="carte" name="carte" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23" required>
      <div class="reseaux"><span>CIB</span><span>VISA</span><span>Mastercard</span><span>e-DINAR</span></div>
      <div class="deux">
        <div><label for="exp">Expiration</label><input id="exp" name="expiration" placeholder="MM/AA" autocomplete="cc-exp" maxlength="5" required></div>
        <div><label for="cvv">CVV</label><input id="cvv" name="cvv" inputmode="numeric" placeholder="123" autocomplete="cc-csc" maxlength="4" required></div>
      </div>
      <label for="nom">Titulaire</label>
      <input id="nom" name="titulaire" autocomplete="cc-name" placeholder="Nom sur la carte" required>
    @else
      <div class="portefeuille">
        <div class="icone">{{ $t->moyen === 'flouci' ? '📱' : '🏤' }}</div>
        <strong>{{ $t->moyen === 'flouci' ? 'Confirmez dans l’application Flouci' : 'Confirmez avec votre e-DINAR / D17' }}</strong>
        <p style="color:var(--doux);margin:6px 0 0">Saisissez votre numéro de téléphone, puis validez le paiement.</p>
      </div>
      <label for="tel">Téléphone</label>
      <input id="tel" name="telephone" inputmode="tel" placeholder="+216 20 000 000" required>
    @endif

    <button class="payer" name="action" value="payer">Payer {{ number_format($t->montant, 3, ',', ' ') }} DT</button>
    <button class="annuler" name="action" value="annuler" formnovalidate>Annuler et revenir</button>
    <p class="securite">🔒 Connexion chiffrée · 3-D Secure</p>
  </form>
</main>
<script>
  const c = document.getElementById('carte');
  if (c) c.addEventListener('input', () => { c.value = c.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); });
  const e = document.getElementById('exp');
  if (e) e.addEventListener('input', () => { const v = e.value.replace(/\D/g, '').slice(0, 4); e.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v; });
</script>
</body>
</html>
