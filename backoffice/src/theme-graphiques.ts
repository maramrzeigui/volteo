import * as echarts from 'echarts/core'
import { C, POLICES, SERIES } from './theme'

/** Thème ECharts « borne », appliqué à tous les graphiques via components/Graphique. */
const AXE = {
  axisLine: { show: true, lineStyle: { color: C.bordure } },
  axisTick: { show: false },
  axisLabel: { color: C.texteDoux, fontFamily: POLICES.texte },
  splitLine: { lineStyle: { color: '#26262D', type: 'dashed' } },
  nameTextStyle: { color: C.texteDiscret },
}

echarts.registerTheme('borne', {
  color: SERIES,
  // Les séries se dessinent progressivement, barre après barre.
  animationDuration: 1100,
  animationEasing: 'cubicOut',
  animationDurationUpdate: 600,
  animationDelay: (i: number) => i * 18,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: POLICES.texte, color: C.texte },
  title: { left: 0, top: 0, textStyle: { fontFamily: POLICES.titre, fontSize: 13, fontWeight: 600, color: C.texte } },
  legend: { top: 0, right: 0, textStyle: { color: C.texteDoux }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
  tooltip: {
    backgroundColor: C.surfaceAlt,
    borderColor: C.bordure,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: C.surEncre, fontFamily: POLICES.texte },
    extraCssText: 'border-radius:12px; box-shadow:0 16px 40px -12px rgba(0,0,0,.6);',
  },
  categoryAxis: AXE,
  valueAxis: { ...AXE, axisLine: { show: false } },
  line: { symbol: 'circle', symbolSize: 6, showSymbol: false, lineStyle: { width: 2.5 }, smooth: 0.3, smoothMonotone: 'x' },
  bar: { itemStyle: { borderRadius: [6, 6, 0, 0] }, barMaxWidth: 22 },
  pie: { itemStyle: { borderColor: C.surface, borderWidth: 3 } },
})
