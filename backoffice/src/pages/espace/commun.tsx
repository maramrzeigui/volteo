import { useState } from 'react'
import { Button } from 'antd'
import { WalletOutlined } from '@ant-design/icons'
import { ModalePaiement } from '../../components/PaiementEnLigne'

/** Rechargement du wallet : carte bancaire, Flouci ou e-DINAR via une passerelle tunisienne. */
export function BoutonRecharge({ type = 'primary' }: { type?: 'primary' | 'default' }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <Button type={type} icon={<WalletOutlined />} onClick={() => setOuvert(true)}>Recharger mon wallet</Button>
      <ModalePaiement ouvert={ouvert} objet={{ objet: 'recharge_wallet' }} onFermer={() => setOuvert(false)} />
    </>
  )
}
