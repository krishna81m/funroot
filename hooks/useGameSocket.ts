'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface JoinParams {
  pin: string
  role: 'HOST' | 'PLAYER'
  identifier?: string
  nickname?: string
}

export function useGameSocket(params: JoinParams | null) {
  const [state, setState] = useState<Record<string, any> | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  // Stable ref to params so the effect doesn't re-run on every render
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    if (!params) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ event: 'client:join', payload: paramsRef.current }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        setState((prev) => handleServerEvent(msg.event, msg.payload, prev))
      } catch {}
    }

    ws.onclose = () => { setConnected(false) }
    ws.onerror = () => { setConnected(false) }

    return () => { ws.close(); wsRef.current = null }
  // Only re-connect when pin or role changes (not on nickname/identifier changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.pin, params?.role])

  const send = useCallback((event: string, payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }))
    }
  }, [])

  return { state, send, connected }
}

function handleServerEvent(
  event: string,
  payload: any,
  prev: Record<string, any> | null
): Record<string, any> {
  const base = prev ?? {}
  switch (event) {
    case 'server:state_sync':
      return { ...base, ...payload }
    case 'server:player_joined':
      return { ...base, players: payload.players, playerCount: payload.players.length }
    case 'server:answer_tally':
      return { ...base, tally: payload }
    case 'server:results':
      return {
        ...base,
        results: payload,
        // Merge aggregation into item so ResultsView can read it
        item: base.item ? { ...base.item, aggregation: payload.aggregation } : base.item,
      }
    case 'server:leaderboard':
      return { ...base, leaderboard: payload.top }
    case 'server:player_result':
      return { ...base, lastResult: payload }
    case 'server:game_paused':
      return { ...base, status: 'PAUSED' }
    case 'server:game_resumed':
      return { ...base }
    case 'server:report_ready':
      return { ...base, reportUrls: { json: payload.downloadJson, csv: payload.downloadCsv } }
    case 'server:tick':
      return { ...base, timeRemaining: payload.timeRemaining }
    case 'server:error':
      console.error('[ws error]', payload)
      return { ...base, lastError: payload.message }
    case 'server:kicked':
      return { ...base, kicked: true, kickReason: payload.reason }
    default:
      return base
  }
}
