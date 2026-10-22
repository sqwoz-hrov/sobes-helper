import { useEffect, useState } from 'react'
import { UserProfile, getUserProfile, setUserInfo } from './api'

const defaultLocalUser: UserProfile = {
  uid: 'default_user',
  display_name: 'Local User',
  email: '',
}

export const useAuth = () => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      let profile = defaultLocalUser
      try {
        profile = await getUserProfile()
      } catch (error) {
        console.error('Failed to load local profile:', error)
      }
      if (active) {
        setUser(profile)
        setUserInfo(profile)
        setIsLoading(false)
      }
    }
    void loadProfile()
    return () => { active = false }
  }, [])

  return { user, isLoading, mode: 'local' as const }
}

// Local pages remain accessible without authentication.
export const useRedirectIfNotAuth = () => useAuth().user
