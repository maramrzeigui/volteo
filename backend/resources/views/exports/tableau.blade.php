<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: DejaVu Sans, sans-serif; color: #1a1a1a; font-size: 10px; }
    .entete { border-bottom: 2px solid #0a7ea4; padding-bottom: 8px; margin-bottom: 14px; }
    .marque { font-size: 16px; font-weight: bold; color: #0a7ea4; }
    h1 { font-size: 15px; margin: 6px 0 2px; }
    .sous-titre { color: #666; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: left; }
    th { background: #f0f5f7; font-weight: bold; }
    tr:nth-child(even) td { background: #fafafa; }
    .pied { margin-top: 14px; font-size: 9px; color: #888; }
  </style>
</head>
<body>
  <div class="entete">
    <div class="marque">⚡ {{ $plateforme }}</div>
    <h1>{{ $titre }}</h1>
    @if ($sousTitre)<div class="sous-titre">{{ $sousTitre }}</div>@endif
  </div>
  <table>
    <thead><tr>@foreach ($colonnes as $c)<th>{{ $c }}</th>@endforeach</tr></thead>
    <tbody>
      @forelse ($lignes as $ligne)
        <tr>@foreach ($ligne as $v)<td>{{ is_float($v) ? number_format($v, 2, ',', ' ') : $v }}</td>@endforeach</tr>
      @empty
        <tr><td colspan="{{ count($colonnes) }}">Aucune donnée sur la période.</td></tr>
      @endforelse
    </tbody>
  </table>
  <div class="pied">{{ count($lignes) }} ligne(s) — généré le {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
