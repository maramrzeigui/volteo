<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\DocumentResource;
use App\Models\Document;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Module 16 — notices, photos, contrats, plans et garanties. */
class AdminDocumentController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return DocumentResource::collection(
            Document::with(['borne', 'auteur'])
                ->when($request->query('borne_id'), fn ($q, $id) => $q->where('borne_id', $id))
                ->when($request->query('maintenance_id'), fn ($q, $id) => $q->where('maintenance_id', $id))
                ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
                ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w->where('titre', 'like', "%{$t}%")->orWhere('nom_fichier', 'like', "%{$t}%")))
                ->when($request->boolean('expire_bientot'), fn ($q) => $q->whereNotNull('date_expiration')->whereDate('date_expiration', '<=', today()->addDays(60)))
                ->latest()
                ->limit(500)
                ->get()
        );
    }

    public function store(Request $request): DocumentResource
    {
        $data = $request->validate([
            'fichier' => ['required', 'file', 'max:20480', 'mimes:pdf,jpg,jpeg,png,webp,gif,doc,docx,xls,xlsx,dwg,dxf,txt,zip'],
            'type' => ['required', Rule::in(Document::TYPES)],
            'titre' => ['required', 'string', 'max:150'],
            'borneId' => ['nullable', 'exists:bornes,id'],
            'dateExpiration' => ['nullable', 'date'],
        ]);

        $fichier = $data['fichier'];

        return new DocumentResource(Document::create([
            'borne_id' => $data['borneId'] ?? null,
            'type' => $data['type'],
            'titre' => $data['titre'],
            'fichier' => $fichier->store('documents/'.($data['borneId'] ?? 'general')),
            'nom_fichier' => $fichier->getClientOriginalName(),
            'mime' => $fichier->getMimeType(),
            'taille' => $fichier->getSize(),
            'date_expiration' => $data['dateExpiration'] ?? null,
            'televerse_par' => $request->user()->id,
        ])->load(['borne', 'auteur']));
    }

    public function telecharger(Request $request, Document $document): StreamedResponse
    {
        abort_unless(Storage::exists($document->fichier), 404, 'Fichier introuvable.');

        // ?inline=1 : affichage dans le navigateur (aperçu des photos et PDF).
        return $request->boolean('inline')
            ? Storage::response($document->fichier, $document->nom_fichier)
            : Storage::download($document->fichier, $document->nom_fichier);
    }

    public function destroy(Document $document): JsonResponse
    {
        Storage::delete($document->fichier);
        $document->delete();

        return response()->json(['message' => 'Document supprimé.']);
    }
}
