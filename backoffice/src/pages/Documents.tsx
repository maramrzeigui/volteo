import { Card } from 'antd'
import DocumentsPanel from '../components/DocumentsPanel'
import { EnTete } from '../components/commun'

/** Module 16 — gestion documentaire. */
export default function DocumentsPage() {
  return (
    <div className="pile">
      <EnTete titre="Documents" sousTitre="Notices, photos, contrats, plans, garanties et diagnostics des bornes" />
      <Card size="small"><DocumentsPanel /></Card>
    </div>
  )
}
