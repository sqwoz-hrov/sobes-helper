'use client'

import { useRouter } from 'next/navigation'
import { Chrome } from 'lucide-react'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [notice, setNotice] = useState('')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to Pickle Glass</h1>
        <p className="text-gray-600 mt-2">Use your own API keys or local models to get started.</p>
      </div>
      <div className="w-full max-w-sm">
        <form
          className="bg-white p-8 rounded-lg shadow-md border border-gray-200"
          onSubmit={(event) => {
            event.preventDefault()
            setNotice('Sign-in is not available yet. Continue in local mode.')
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Chrome className="h-5 w-5" />
            <span>Sign in with Google</span>
          </button>
          {notice && <p role="status" className="mt-4 text-sm text-gray-600">{notice}</p>}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Continue in local mode
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
