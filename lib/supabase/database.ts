export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          bio: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
        }
        Update: {
          username?: string
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
        }
      }
      bookmarks: {
        Row: {
          id: string
          user_id: string
          url: string
          title: string | null
          description: string | null
          image_url: string | null
          screenshot_url: string | null
          favicon_url: string | null
          tags: string[]
          is_private: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          url: string
          title?: string | null
          description?: string | null
          image_url?: string | null
          screenshot_url?: string | null
          favicon_url?: string | null
          tags?: string[]
          is_private?: boolean
        }
        Update: {
          url?: string
          title?: string | null
          description?: string | null
          image_url?: string | null
          screenshot_url?: string | null
          favicon_url?: string | null
          tags?: string[]
          is_private?: boolean
        }
      }
      follows: {
        Row: {
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: {
          follower_id: string
          following_id: string
        }
        Update: {
          follower_id?: string
          following_id?: string
        }
      }
    }
  }
}
