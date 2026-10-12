import ReactECharts, { type EChartsReactProps } from 'echarts-for-react'
import '../theme-graphiques'

/** Graphique ECharts habillé du thème « borne » (couleurs, typographie, infobulles). */
export default function Graphique(props: EChartsReactProps) {
  return <ReactECharts theme="borne" opts={{ renderer: 'svg' }} {...props} />
}
