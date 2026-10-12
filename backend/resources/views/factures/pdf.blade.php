<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: DejaVu Sans, sans-serif; color: #1a1a1a; font-size: 13px; }
    .entete { display: table; width: 100%; margin-bottom: 30px; }
    .entete > div { display: table-cell; vertical-align: top; }
    .logo { font-size: 24px; font-weight: bold; color: #0a7ea4; }
    .logo img { max-height: 48px; }
    .numero { text-align: right; color: #555; }
    h1 { font-size: 18px; margin: 20px 0 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
    th { background: #f0f5f7; }
    .totaux { width: 45%; margin-left: 55%; }
    .totaux td { text-align: right; }
    .totaux tr.ttc td { font-weight: bold; font-size: 15px; background: #f0f5f7; }
    .statut { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; color: #fff; }
    .payee { background: #389e0d; } .emise { background: #d48806; } .remboursee { background: #8c8c8c; }
    .pied { margin-top: 50px; font-size: 11px; color: #888; }
  </style>
</head>
@php
  $devise = $parametres['devise'] ?? 'DT';
  $ttc = $facture->montant_ttc;
  $taux = $facture->taux_tva ?? ($parametres['tva_taux'] ?? 19);
  $ht = $facture->montant_ht ?? round($ttc / (1 + $taux / 100), 2);
  $tva = $facture->montant_tva ?? round($ttc - $ht, 2);
  $logo = !empty($parametres['logo']) ? storage_path('app/public/'.$parametres['logo']) : null;
  $fmt = fn ($v) => number_format($v, 2, ',', ' ').' '.$devise;
@endphp
<body>
  <div class="entete">
    <div class="logo">
      @if ($logo && is_file($logo))<img src="{{ $logo }}" alt="logo">@else ⚡ {{ $parametres['plateforme_nom'] ?? 'Volteo' }}@endif
    </div>
    <div class="numero">
      Facture <strong>{{ $facture->numero }}</strong><br>
      Date : {{ $facture->date->format('d/m/Y') }}<br>
      <span class="statut {{ $facture->statut }}">{{ ['payee' => 'Payée', 'emise' => 'À régler', 'remboursee' => 'Remboursée'][$facture->statut] ?? $facture->statut }}</span>
    </div>
  </div>

  <p>
    <strong>Client :</strong> {{ $user->prenom }} {{ $user->nom }}<br>
    {{ $user->email }}@if ($user->telephone)<br>{{ $user->telephone }}@endif
  </p>

  <h1>Détail de la recharge</h1>
  <table>
    <tr><th>Borne</th><th>Connecteur</th><th>Début</th><th>Fin</th><th>Énergie</th><th>Tarif</th></tr>
    <tr>
      <td>{{ $session?->borne?->nom ?? '—' }}<br><small>{{ $session?->borne?->adresse }}</small></td>
      <td>{{ $session?->connecteur?->type ?? '—' }}</td>
      <td>{{ $session?->date_debut?->format('d/m/Y H:i') ?? '—' }}</td>
      <td>{{ $session?->date_fin?->format('d/m/Y H:i') ?? '—' }}</td>
      <td>{{ number_format($session?->energie_kwh ?? 0, 2, ',', ' ') }} kWh</td>
      <td>{{ $session?->tarif?->nom ?? 'Prix au kWh' }}</td>
    </tr>
  </table>

  <table class="totaux">
    <tr><td>Total HT</td><td>{{ $fmt($ht) }}</td></tr>
    <tr><td>TVA {{ rtrim(rtrim(number_format($taux, 2, ',', ''), '0'), ',') }} %</td><td>{{ $fmt($tva) }}</td></tr>
    <tr class="ttc"><td>Total TTC</td><td>{{ $fmt($ttc) }}</td></tr>
  </table>

  <p class="pied">
    {{ $parametres['mentions_facture'] ?? '' }}<br>
    Document généré électroniquement, valable sans signature.
  </p>
</body>
</html>
