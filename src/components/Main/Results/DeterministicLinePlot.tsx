import React, { useState } from 'react'

import _ from 'lodash'

import ReactResizeDetector from 'react-resize-detector'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Label,
  ReferenceArea,
  Scatter,
  Area,
  Tooltip,
  TooltipPayload,
  XAxis,
  YAxis,
  YAxisProps,
  LineProps as RechartsLineProps,
} from 'recharts'

import { useTranslation } from 'react-i18next'
import { AlgorithmResult } from '../../../algorithms/types/Result.types'
import { AllParams, ContainmentData, EmpiricalData } from '../../../algorithms/types/Param.types'
import { numberFormatter } from '../../../helpers/numberFormat'

import { calculatePosition, scrollToRef } from './chartHelper'
import { ResponsiveTooltipContent } from './ResponsiveTooltipContent'

import './DeterministicLinePlot.scss'

const ASPECT_RATIO = 16 / 9

const DATA_POINTS = {
  /* Computed */
  Exposed: 'exposed',
  Susceptible: 'susceptible',
  Infectious: 'infectious',
  Severe: 'severe',
  Critical: 'critical',
  Overflow: 'overflow',
  Recovered: 'recovered',
  Fatalities: 'fatality',
  CumulativeCases: 'cumulativeCases',
  NewCases: 'newCases',
  HospitalBeds: 'hospitalBeds',
  ICUbeds: 'ICUbeds',
  /* Observed */
  ObservedDeaths: 'observedDeaths',
  ObservedCases: 'cases',
  ObservedHospitalized: 'currentHospitalized',
  ObservedICU: 'ICU',
  ObservedNewCases: 'newCases',
}

export const colors = {
  [DATA_POINTS.Susceptible]: '#a6cee3',
  [DATA_POINTS.Infectious]: '#fdbf6f',
  [DATA_POINTS.Severe]: '#fb9a99',
  [DATA_POINTS.Critical]: '#e31a1c',
  [DATA_POINTS.Overflow]: '#900d2c',
  [DATA_POINTS.Recovered]: '#33a02c',
  [DATA_POINTS.Fatalities]: '#5e506a',
  [DATA_POINTS.CumulativeCases]: '#aaaaaa',
  [DATA_POINTS.NewCases]: '#fdbf6f',
  [DATA_POINTS.HospitalBeds]: '#bbbbbb',
  [DATA_POINTS.ICUbeds]: '#cccccc',
}

export interface LinePlotProps {
  data?: AlgorithmResult
  params: AllParams
  mitigation: ContainmentData
  logScale?: boolean
  showHumanized?: boolean
  caseCounts?: EmpiricalData
  forcedWidth?: number
  forcedHeight?: number
}

interface LineProps {
  key: string
  name: string
  color: string
  legendType?: RechartsLineProps['legendType']
}

function xTickFormatter(tick: string | number): string {
  return new Date(tick).toISOString().slice(0, 10)
}

function labelFormatter(value: string | number): React.ReactNode {
  return xTickFormatter(value)
}

function legendFormatter(enabledPlots: string[], value: string, entry: any) {
  const activeClassName = enabledPlots.includes(entry.dataKey) ? 'legend' : 'legend-inactive'
  return <span className={activeClassName}>{value}</span>
}

export function DeterministicLinePlot({
  data,
  params,
  mitigation,
  logScale,
  showHumanized,
  caseCounts,
  forcedWidth,
  forcedHeight,
}: LinePlotProps) {
  const { t } = useTranslation()
  const chartRef = React.useRef(null)
  const [enabledPlots, setEnabledPlots] = useState(Object.values(DATA_POINTS))

  // RULE OF HOOKS #1: hooks go before anything else. Hooks ^, ahything else v.
  // href: https://reactjs.org/docs/hooks-rules.html

  const formatNumber = numberFormatter(!!showHumanized, false)
  const formatNumberRounded = numberFormatter(!!showHumanized, true)

  // const [zoomLeftState, setzoomLeftState] = useState('dataMin')
  // const [zoomRightState, setzoomRightState] = useState('dataMax')
  // const [zoomSelectedLeftState, setzoomSelectedLeftState] = useState('')
  // const [zoomSelectedRightState, setzoomSelectedRightState] = useState('')

  if (!data) {
    return null
  }

  const { mitigationIntervals } = mitigation

  const verifyPositive = (x: number) => (x > 0 ? x : undefined)

  const nHospitalBeds = verifyPositive(params.population.hospitalBeds)
  const nICUBeds = verifyPositive(params.population.ICUBeds)

  const nonEmptyCaseCounts = caseCounts?.filter((d) => d.cases || d.deaths || d.icu || d.hospitalized)

  const caseStep = 3

  // this currently relies on there being data for every day. This should be
  // the case given how the data are parsed, but would be good to put in a check
  const newCases = (cc: EmpiricalData, i: number) => {
    if (i >= caseStep && cc[i].cases && cc[i - caseStep].cases) {
      return verifyPositive(cc[i].cases - cc[i - caseStep].cases)
    }
    return undefined
  }

  const countObservations = {
    cases: nonEmptyCaseCounts?.filter((d) => d.cases).length ?? 0,
    ICU: nonEmptyCaseCounts?.filter((d) => d.icu).length ?? 0,
    observedDeaths: nonEmptyCaseCounts?.filter((d) => d.deaths).length ?? 0,
    newCases: nonEmptyCaseCounts?.filter((_, i) => newCases(nonEmptyCaseCounts, i)).length ?? 0,
    hospitalized: nonEmptyCaseCounts?.filter((d) => d.hospitalized).length ?? 0,
  }

  const observations =
    nonEmptyCaseCounts?.map((d, i) => ({
      time: new Date(d.time).getTime(),
      cases: enabledPlots.includes(DATA_POINTS.ObservedCases) ? d.cases || undefined : undefined,
      observedDeaths: enabledPlots.includes(DATA_POINTS.ObservedDeaths) ? d.deaths || undefined : undefined,
      currentHospitalized: enabledPlots.includes(DATA_POINTS.ObservedHospitalized)
        ? d.hospitalized || undefined
        : undefined,
      ICU: enabledPlots.includes(DATA_POINTS.ObservedICU) ? d.icu || undefined : undefined,
      newCases: enabledPlots.includes(DATA_POINTS.ObservedNewCases) ? newCases(nonEmptyCaseCounts, i) : undefined,
      hospitalBeds: nHospitalBeds,
      ICUbeds: nICUBeds,
    })) ?? []

  const upper = data.trajectory.upper
  const lower = data.trajectory.lower

  const plotData = [
    ...data.trajectory.mean.map((x, i) => ({
      time: x.time,
      susceptible: enabledPlots.includes(DATA_POINTS.Susceptible)
        ? Math.round(x.current.susceptible.total) || undefined
        : undefined,
      infectious: enabledPlots.includes(DATA_POINTS.Infectious)
        ? Math.round(x.current.infectious.total) || undefined
        : undefined,
      severe: enabledPlots.includes(DATA_POINTS.Severe) ? Math.round(x.current.severe.total) || undefined : undefined,
      critical: enabledPlots.includes(DATA_POINTS.Critical)
        ? Math.round(x.current.critical.total) || undefined
        : undefined,
      overflow: enabledPlots.includes(DATA_POINTS.Overflow)
        ? Math.round(x.current.overflow.total) || undefined
        : undefined,
      recovered: enabledPlots.includes(DATA_POINTS.Recovered)
        ? Math.round(x.cumulative.recovered.total) || undefined
        : undefined,
      fatality: enabledPlots.includes(DATA_POINTS.Fatalities)
        ? Math.round(x.cumulative.fatality.total) || undefined
        : undefined,
      hospitalBeds: nHospitalBeds,
      ICUbeds: nICUBeds,

      // Error bars
      susceptible_area: enabledPlots.includes(DATA_POINTS.Susceptible)
        ? [Math.round(lower[i].current.susceptible.total), Math.round(upper[i].current.susceptible.total)] || undefined
        : undefined,
      infectious_area: enabledPlots.includes(DATA_POINTS.Infectious)
        ? [Math.round(lower[i].current.infectious.total), Math.round(upper[i].current.infectious.total)] || undefined
        : undefined,
      severe_area: enabledPlots.includes(DATA_POINTS.Severe)
        ? [Math.round(lower[i].current.severe.total), Math.round(upper[i].current.severe.total)] || undefined
        : undefined,
      critical_area: enabledPlots.includes(DATA_POINTS.Critical)
        ? [Math.round(lower[i].current.critical.total), Math.round(upper[i].current.critical.total)] || undefined
        : undefined,
      overflow_area: enabledPlots.includes(DATA_POINTS.Overflow)
        ? [Math.round(lower[i].current.overflow.total), Math.round(upper[i].current.overflow.total)] || undefined
        : undefined,
      recovered_area: enabledPlots.includes(DATA_POINTS.Recovered)
        ? [Math.round(lower[i].cumulative.recovered.total), Math.round(upper[i].cumulative.recovered.total)] ||
          undefined
        : undefined,
      fatality_area: enabledPlots.includes(DATA_POINTS.Fatalities)
        ? [Math.round(lower[i].cumulative.fatality.total), Math.round(upper[i].cumulative.fatality.total)] || undefined
        : undefined,
    })),

    ...observations,
  ]

  if (plotData.length === 0) {
    return null
  }

  plotData.sort((a, b) => (a.time > b.time ? 1 : -1))
  const consolidatedPlotData = [plotData[0]]
  plotData.forEach((d) => {
    if (d.time === consolidatedPlotData[consolidatedPlotData.length - 1].time) {
      consolidatedPlotData[consolidatedPlotData.length - 1] = {
        ...consolidatedPlotData[consolidatedPlotData.length - 1],
        ...d,
      }
    } else {
      consolidatedPlotData.push(d)
    }
  })

  // determine the max of enabled plots w/o the hospital capacity
  const dataKeys = enabledPlots.filter((d) => d !== DATA_POINTS.HospitalBeds && d !== DATA_POINTS.ICUbeds)
  const yDataMax = _.max(consolidatedPlotData.map((d) => _.max(dataKeys.map((k) => d[k]))))

  const linesToPlot: LineProps[] = [
    { key: DATA_POINTS.Susceptible, color: colors.susceptible, name: t('Susceptible'), legendType: 'line' },
    { key: DATA_POINTS.Recovered, color: colors.recovered, name: t('Recovered'), legendType: 'line' },
    { key: DATA_POINTS.Infectious, color: colors.infectious, name: t('Infectious'), legendType: 'line' },
    { key: DATA_POINTS.Severe, color: colors.severe, name: t('Severely ill'), legendType: 'line' },
    { key: DATA_POINTS.Critical, color: colors.critical, name: t('Patients in ICU (model)'), legendType: 'line' },
    { key: DATA_POINTS.Overflow, color: colors.overflow, name: t('ICU overflow'), legendType: 'line' },
    { key: DATA_POINTS.Fatalities, color: colors.fatality, name: t('Cumulative deaths (model)'), legendType: 'line' },
    { key: DATA_POINTS.HospitalBeds, color: colors.hospitalBeds, name: t('Total hospital beds'), legendType: 'none' },
    { key: DATA_POINTS.ICUbeds, color: colors.ICUbeds, name: t('Total ICU/ICM beds'), legendType: 'none' },
  ]

  const tMin = _.minBy(plotData, 'time')!.time // eslint-disable-line @typescript-eslint/no-non-null-assertion
  const tMax = _.maxBy(plotData, 'time')!.time // eslint-disable-line @typescript-eslint/no-non-null-assertion

  const scatterToPlot: LineProps[] = observations.length
    ? [
        // Append empirical data
        ...(countObservations.cases
          ? [{ key: DATA_POINTS.ObservedCases, color: colors.cumulativeCases, name: t('Cumulative cases (data)') }]
          : []),
        ...(countObservations.newCases
          ? [{ key: DATA_POINTS.ObservedNewCases, color: colors.newCases, name: t('Cases past 3 days (data)') }]
          : []),
        ...(countObservations.hospitalized
          ? [{ key: DATA_POINTS.ObservedHospitalized, color: colors.severe, name: t('Patients in hospital (data)') }]
          : []),
        ...(countObservations.ICU
          ? [{ key: DATA_POINTS.ObservedICU, color: colors.critical, name: t('Patients in ICU (data)') }]
          : []),
        ...(countObservations.observedDeaths
          ? [{ key: DATA_POINTS.ObservedDeaths, color: colors.fatality, name: t('Cumulative deaths (data)') }]
          : []),
      ]
    : []

  const areasToPlot: LineProps[] = [
    {
      key: `${DATA_POINTS.Susceptible}_area`,
      color: colors.susceptible,
      name: t('Susceptible uncertainty'),
      legendType: 'none',
    },
    {
      key: `${DATA_POINTS.Infectious}_area`,
      color: colors.infectious,
      name: t('Infectious uncertainty'),
      legendType: 'none',
    },
    {
      key: `${DATA_POINTS.Severe}_area`,
      color: colors.severe,
      name: t('Severely ill uncertainty'),
      legendType: 'none',
    },
    {
      key: `${DATA_POINTS.Critical}_area`,
      color: colors.critical,
      name: t('Patients in ICU (model) uncertainty'),
      legendType: 'none',
    },
    {
      key: `${DATA_POINTS.Overflow}_area`,
      color: colors.overflow,
      name: t('ICU overflow uncertainty'),
      legendType: 'none',
    },
    {
      key: `${DATA_POINTS.Recovered}_area`,
      color: colors.recovered,
      name: t('Recovered uncertainty'),
      legendType: 'none',
    },
    {
      key: `${DATA_POINTS.Fatalities}_area`,
      color: colors.fatality,
      name: t('Cumulative deaths (model) uncertainty'),
      legendType: 'none',
    },
  ]

  const logScaleString: YAxisProps['scale'] = logScale ? 'log' : 'linear'

  const tooltipFormatter = (
    value: string | number | Array<string | number>,
    name: string,
    entry: TooltipPayload,
    index: number,
  ): React.ReactNode => <span>{formatNumber(Number(value))}</span>

  const yTickFormatter = (value: number) => formatNumberRounded(value)

  return (
    <div className="w-100 h-100" data-testid="DeterministicLinePlot">
      <ReactResizeDetector handleWidth handleHeight>
        {({ width }: { width?: number }) => {
          if (!width) {
            return <div className="w-100 h-100" />
          }

          const height = Math.max(500, width / ASPECT_RATIO)
          const tooltipPosition = calculatePosition(height)

          return (
            <>
              <div ref={chartRef} />
              <ComposedChart
                width={forcedWidth || width}
                height={forcedHeight ? forcedHeight / 4 : height / 4}
                margin={{
                  left: 5,
                  right: 5,
                  top: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  allowDataOverflow={true}
                  dataKey="time"
                  type="number"
                  domain={[tMin, tMax]}
                  tickFormatter={() => ''}
                  tickCount={7}
                />
                <YAxis
                  yAxisId="mitigationStrengthAxis"
                  allowDataOverflow={true}
                  orientation={'left'}
                  type="number"
                  domain={[0, 100]}
                />
                {mitigationIntervals.map((interval) => (
                  <ReferenceArea
                    key={interval.id}
                    x1={_.clamp(interval.timeRange.tMin.getTime(), tMin, tMax)}
                    x2={_.clamp(interval.timeRange.tMax.getTime(), tMin, tMax)}
                    y1={0}
                    y2={_.clamp(interval.mitigationValue, 0, 100)}
                    yAxisId={'mitigationStrengthAxis'}
                    fill={interval.color}
                    fillOpacity={0.1}
                  >
                    <Label value={interval.name} position="insideTopRight" fill="#444444" />
                  </ReferenceArea>
                ))}
              </ComposedChart>

              <ComposedChart
                onClick={() => scrollToRef(chartRef)}
                width={forcedWidth || width}
                height={forcedHeight || height}
                data={consolidatedPlotData}
                throttleDelay={75}
                margin={{
                  left: 5,
                  right: 5,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  allowDataOverflow
                  dataKey="time"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={xTickFormatter}
                  tickCount={7}
                />

                <YAxis
                  allowDataOverflow
                  scale={logScaleString}
                  type="number"
                  domain={logScale ? [1, yDataMax * 1.1] : [0, yDataMax * 1.1]}
                  tickFormatter={yTickFormatter}
                />

                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={labelFormatter}
                  position={tooltipPosition}
                  content={ResponsiveTooltipContent}
                />

                <Legend
                  verticalAlign="bottom"
                  formatter={(v, e) => legendFormatter(enabledPlots, v, e)}
                  onClick={(e) => {
                    const plots = enabledPlots.slice(0)
                    enabledPlots.includes(e.dataKey) ? plots.splice(plots.indexOf(e.dataKey), 1) : plots.push(e.dataKey)
                    setEnabledPlots(plots)
                  }}
                />

                {scatterToPlot.map((d) => (
                  <Scatter key={d.key} dataKey={d.key} fill={d.color} name={d.name} isAnimationActive={false} />
                ))}

                {linesToPlot.map((d) => (
                  <Line
                    key={d.key}
                    dot={false}
                    isAnimationActive={false}
                    type="monotone"
                    strokeWidth={3}
                    dataKey={d.key}
                    stroke={d.color}
                    name={d.name}
                    legendType={d.legendType}
                  />
                ))}

                {areasToPlot.map((d) => (
                  <Area
                    key={d.key}
                    type="monotone"
                    fillOpacity={0.15}
                    dataKey={d.key}
                    isAnimationActive={false}
                    name={d.name}
                    stroke={d.color}
                    strokeWidth={0}
                    fill={d.color}
                    legendType={d.legendType}
                  />
                ))}
              </ComposedChart>
            </>
          )
        }}
      </ReactResizeDetector>
    </div>
  )
}
