import { useEffect, useId, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { AlertTriangle, X } from 'lucide-react'
import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

export function QrScannerModal({ title, onResult, onClose }: { title: string; onResult: (value: string) => void; onClose: () => void }) {
  const reactId = useId().replaceAll(':', '')
  const elementId = `attendx-qr-${reactId}`
  const [error, setError] = useState('')
  
  useEffect(() => {
    const scanner = new Html5Qrcode(elementId)
    let isUnmounted = false
    let startPromise: Promise<any> | null = null

    const init = async () => {
      if (Capacitor.isNativePlatform()) {
        let perm = await Camera.checkPermissions()
        if (perm.camera !== 'granted') {
          perm = await Camera.requestPermissions()
        }
        if (perm.camera !== 'granted') throw new Error('Camera permission denied')
      }
      
      const cameras = await Html5Qrcode.getCameras()
      if (isUnmounted) return
      if (!cameras.length) throw new Error('No camera was found')
      
      startPromise = scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (value) => {
          void scanner.stop().catch(() => undefined).finally(() => scanner.clear())
          onResult(value)
        },
        () => undefined
      )
      
      await startPromise
      if (isUnmounted) {
        void scanner.stop().catch(() => undefined).finally(() => scanner.clear())
      }
    }

    init().catch((reason) => {
      if (!isUnmounted) setError(reason instanceof Error ? reason.message : 'Could not start QR scanner')
    })

    return () => {
      isUnmounted = true
      if (startPromise) {
        startPromise.then(() => {
          void scanner.stop().catch(() => undefined).finally(() => scanner.clear())
        }).catch(() => undefined)
      }
    }
  }, [elementId, onResult])
  return <div className="camera-modal"><div className="qr-scanner-modal"><button className="icon-button camera-close" onClick={onClose} aria-label="Close scanner"><X/></button><h2>{title}</h2>{error && <div className="inline-error"><AlertTriangle size={16}/>{error}</div>}<div id={elementId} className="qr-reader"/></div></div>
}

export function extractJoinToken(value: string): string {
  const match = value.match(/[?&]token=([a-f0-9]+)/i)
  return match ? match[1] : value.trim()
}
