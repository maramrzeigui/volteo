<?php

namespace App\Support;

use App\Models\Parametre;
use Barryvdh\DomPDF\Facade\Pdf;
use Symfony\Component\HttpFoundation\Response;
use ZipArchive;

/**
 * Exports tabulaires PDF, Excel (.xlsx) et CSV (modules 14 et 18).
 * Le .xlsx est écrit directement au format Office Open XML (ZipArchive).
 */
class Exporteur
{
    public const FORMATS = ['pdf', 'xlsx', 'csv'];

    /**
     * @param  array<string, string>  $colonnes  clé → libellé
     * @param  iterable<array<string, mixed>>  $lignes
     */
    public static function reponse(string $titre, array $colonnes, iterable $lignes, string $format, ?string $sousTitre = null): Response
    {
        $nom = str($titre)->slug()->append('-'.now()->format('Ymd-His'))->toString();
        $lignes = collect($lignes)->map(fn ($l) => array_map(fn ($cle) => $l[$cle] ?? '', array_keys($colonnes)))->all();

        return match ($format) {
            'csv' => self::csv($nom, $colonnes, $lignes),
            'xlsx' => self::xlsx($nom, $titre, $colonnes, $lignes),
            default => self::pdf($nom, $titre, $sousTitre, $colonnes, $lignes),
        };
    }

    private static function csv(string $nom, array $colonnes, array $lignes): Response
    {
        $flux = fopen('php://temp', 'r+');
        fwrite($flux, "\xEF\xBB\xBF"); // BOM : accents corrects à l'ouverture dans Excel
        fputcsv($flux, array_values($colonnes), ';', '"', '');
        foreach ($lignes as $ligne) {
            fputcsv($flux, $ligne, ';', '"', '');
        }
        rewind($flux);
        $contenu = stream_get_contents($flux);
        fclose($flux);

        return response($contenu, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$nom}.csv\"",
        ]);
    }

    private static function pdf(string $nom, string $titre, ?string $sousTitre, array $colonnes, array $lignes): Response
    {
        return Pdf::loadView('exports.tableau', [
            'titre' => $titre,
            'sousTitre' => $sousTitre,
            'colonnes' => array_values($colonnes),
            'lignes' => $lignes,
            'plateforme' => Parametre::get('plateforme_nom'),
        ])->setPaper('a4', count($colonnes) > 5 ? 'landscape' : 'portrait')->download("{$nom}.pdf");
    }

    private static function xlsx(string $nom, string $titre, array $colonnes, array $lignes): Response
    {
        $cellule = function (mixed $valeur, int $col, int $ligne, bool $entete = false): string {
            $ref = self::colonne($col).$ligne;
            $style = $entete ? ' s="1"' : '';
            if (is_int($valeur) || is_float($valeur)) {
                return "<c r=\"{$ref}\"{$style}><v>{$valeur}</v></c>";
            }
            $texte = htmlspecialchars((string) $valeur, ENT_XML1 | ENT_QUOTES, 'UTF-8');

            return "<c r=\"{$ref}\" t=\"inlineStr\"{$style}><is><t xml:space=\"preserve\">{$texte}</t></is></c>";
        };

        $xmlLignes = '<row r="1">';
        foreach (array_values($colonnes) as $i => $libelle) {
            $xmlLignes .= $cellule($libelle, $i, 1, true);
        }
        $xmlLignes .= '</row>';
        foreach ($lignes as $n => $ligne) {
            $r = $n + 2;
            $xmlLignes .= "<row r=\"{$r}\">";
            foreach (array_values($ligne) as $i => $valeur) {
                $xmlLignes .= $cellule($valeur, $i, $r);
            }
            $xmlLignes .= '</row>';
        }

        $largeurs = '';
        foreach (array_values($colonnes) as $i => $_) {
            $largeurs .= '<col min="'.($i + 1).'" max="'.($i + 1).'" width="22" customWidth="1"/>';
        }

        $feuille = mb_substr(preg_replace('/[\\\\\/?*\[\]:]/', '', $titre), 0, 31);
        $fichier = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive;
        $zip->open($fichier, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'.htmlspecialchars($feuille ?: 'Export', ENT_XML1).'" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>');
        $zip->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'.$largeurs.'</cols><sheetData>'.$xmlLignes.'</sheetData></worksheet>');
        $zip->close();

        return response()->download($fichier, "{$nom}.xlsx", [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    private static function colonne(int $index): string
    {
        $lettres = '';
        for ($i = $index; $i >= 0; $i = intdiv($i, 26) - 1) {
            $lettres = chr(65 + $i % 26).$lettres;
        }

        return $lettres;
    }
}
