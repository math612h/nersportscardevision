export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_message_log: {
        Row: {
          id: string
          sent_at: string
          sent_by: string | null
          template: string
          user_id: string
        }
        Insert: {
          id?: string
          sent_at?: string
          sent_by?: string | null
          template: string
          user_id: string
        }
        Update: {
          id?: string
          sent_at?: string
          sent_by?: string | null
          template?: string
          user_id?: string
        }
        Relationships: []
      }
      briefing_raised_hands: {
        Row: {
          division_id: string
          raised_at: string
          user_id: string
        }
        Insert: {
          division_id: string
          raised_at?: string
          user_id: string
        }
        Update: {
          division_id?: string
          raised_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefing_raised_hands_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_members: {
        Row: {
          group_id: string
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      division_absences: {
        Row: {
          created_at: string
          division_id: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          division_id: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          division_id?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      division_lobbies: {
        Row: {
          division_id: string
          lobby_code: string | null
          lobby_password: string | null
          server_name: string | null
          updated_at: string
        }
        Insert: {
          division_id: string
          lobby_code?: string | null
          lobby_password?: string | null
          server_name?: string | null
          updated_at?: string
        }
        Update: {
          division_id?: string
          lobby_code?: string | null
          lobby_password?: string | null
          server_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      division_practice_sessions: {
        Row: {
          created_at: string
          division_id: string
          has_qualifying: boolean
          has_race: boolean
          id: string
          lobby_code: string | null
          lobby_password: string | null
          practice_minutes: number | null
          qualifying_minutes: number | null
          race_minutes: number | null
          server_name: string | null
          settings: Json
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id: string
          has_qualifying?: boolean
          has_race?: boolean
          id?: string
          lobby_code?: string | null
          lobby_password?: string | null
          practice_minutes?: number | null
          qualifying_minutes?: number | null
          race_minutes?: number | null
          server_name?: string | null
          settings?: Json
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: string
          has_qualifying?: boolean
          has_race?: boolean
          id?: string
          lobby_code?: string | null
          lobby_password?: string | null
          practice_minutes?: number | null
          qualifying_minutes?: number | null
          race_minutes?: number | null
          server_name?: string | null
          settings?: Json
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_practice_sessions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      division_reserve_offers: {
        Row: {
          absentee_user_id: string
          car_class: string
          created_at: string
          division_id: string
          driver_category: string
          expires_at: string
          id: string
          offered_user_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["reserve_offer_status"]
          updated_at: string
        }
        Insert: {
          absentee_user_id: string
          car_class: string
          created_at?: string
          division_id: string
          driver_category: string
          expires_at: string
          id?: string
          offered_user_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["reserve_offer_status"]
          updated_at?: string
        }
        Update: {
          absentee_user_id?: string
          car_class?: string
          created_at?: string
          division_id?: string
          driver_category?: string
          expires_at?: string
          id?: string
          offered_user_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["reserve_offer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_reserve_offers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          car_class: string | null
          created_at: string
          driver_category: string | null
          id: string
          image_url: string | null
          layout: string | null
          league_id: string
          name: string
          race_date: string | null
          server_started_at: string | null
          settings: Json
          track: string | null
        }
        Insert: {
          car_class?: string | null
          created_at?: string
          driver_category?: string | null
          id?: string
          image_url?: string | null
          layout?: string | null
          league_id: string
          name: string
          race_date?: string | null
          server_started_at?: string | null
          settings?: Json
          track?: string | null
        }
        Update: {
          car_class?: string | null
          created_at?: string
          driver_category?: string | null
          id?: string
          image_url?: string | null
          layout?: string | null
          league_id?: string
          name?: string
          race_date?: string | null
          server_started_at?: string | null
          settings?: Json
          track?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "divisions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entries: {
        Row: {
          car_class: string
          car_model: string | null
          car_number: number | null
          created_at: string
          division_id: string | null
          driver_category: string
          driver_name: string
          id: string
          league_id: string | null
          team_id: string | null
          user_id: string
          waitlist: boolean
        }
        Insert: {
          car_class: string
          car_model?: string | null
          car_number?: number | null
          created_at?: string
          division_id?: string | null
          driver_category: string
          driver_name: string
          id?: string
          league_id?: string | null
          team_id?: string | null
          user_id: string
          waitlist?: boolean
        }
        Update: {
          car_class?: string
          car_model?: string | null
          car_number?: number | null
          created_at?: string
          division_id?: string | null
          driver_category?: string
          driver_name?: string
          id?: string
          league_id?: string | null
          team_id?: string | null
          user_id?: string
          waitlist?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entries_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_times: {
        Row: {
          best_lap_ms: number
          car_class: string
          car_model: string | null
          created_at: string
          division_id: string | null
          driver_name: string
          id: string
          layout: string | null
          recorded_at: string | null
          source: string
          track: string
          uploaded_by: string
          user_id: string
        }
        Insert: {
          best_lap_ms: number
          car_class: string
          car_model?: string | null
          created_at?: string
          division_id?: string | null
          driver_name: string
          id?: string
          layout?: string | null
          recorded_at?: string | null
          source: string
          track: string
          uploaded_by: string
          user_id: string
        }
        Update: {
          best_lap_ms?: number
          car_class?: string
          car_model?: string | null
          created_at?: string
          division_id?: string | null
          driver_name?: string
          id?: string
          layout?: string | null
          recorded_at?: string | null
          source?: string
          track?: string
          uploaded_by?: string
          user_id?: string
        }
        Relationships: []
      }
      league_results: {
        Row: {
          avg_lap_ms: number | null
          best_lap_ms: number | null
          car_class: string
          car_model: string | null
          created_at: string
          division_id: string | null
          id: string
          layout: string | null
          league_id: string
          notes: string | null
          points: number | null
          position: number | null
          round: number | null
          session_type: string
          track: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_lap_ms?: number | null
          best_lap_ms?: number | null
          car_class: string
          car_model?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          layout?: string | null
          league_id: string
          notes?: string | null
          points?: number | null
          position?: number | null
          round?: number | null
          session_type?: string
          track: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_lap_ms?: number | null
          best_lap_ms?: number | null
          car_class?: string
          car_model?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          layout?: string | null
          league_id?: string
          notes?: string | null
          points?: number | null
          position?: number | null
          round?: number | null
          session_type?: string
          track?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_results_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_results_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rules_acknowledgements: {
        Row: {
          acknowledged_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_rules_acknowledgements_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          approved_only: boolean
          banner_url: string | null
          briefing_required: boolean
          car_class: string | null
          car_lock_at: string | null
          car_lock_never: boolean
          class_configs: Json
          created_at: string
          created_by: string | null
          description: string | null
          discord_role_id: string | null
          discord_signup_open_notified_at: string | null
          driver_category: string | null
          event_settings: Json
          id: string
          is_offseason: boolean
          name: string
          points_system: Json
          protest_tickets_per_season: number
          published: boolean
          separate_division_standings: boolean
          signup_open_notified_at: string | null
          signup_opens_at: string | null
          sort_order: number
        }
        Insert: {
          approved_only?: boolean
          banner_url?: string | null
          briefing_required?: boolean
          car_class?: string | null
          car_lock_at?: string | null
          car_lock_never?: boolean
          class_configs?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          discord_role_id?: string | null
          discord_signup_open_notified_at?: string | null
          driver_category?: string | null
          event_settings?: Json
          id?: string
          is_offseason?: boolean
          name: string
          points_system?: Json
          protest_tickets_per_season?: number
          published?: boolean
          separate_division_standings?: boolean
          signup_open_notified_at?: string | null
          signup_opens_at?: string | null
          sort_order?: number
        }
        Update: {
          approved_only?: boolean
          banner_url?: string | null
          briefing_required?: boolean
          car_class?: string | null
          car_lock_at?: string | null
          car_lock_never?: boolean
          class_configs?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          discord_role_id?: string | null
          discord_signup_open_notified_at?: string | null
          driver_category?: string | null
          event_settings?: Json
          id?: string
          is_offseason?: boolean
          name?: string
          points_system?: Json
          protest_tickets_per_season?: number
          published?: boolean
          separate_division_standings?: boolean
          signup_open_notified_at?: string | null
          signup_opens_at?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      news_posts: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          image_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          image_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          image_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      points_system_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fastest_lap_points: number
          id: string
          name: string
          points_per_position: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fastest_lap_points?: number
          id?: string
          name: string
          points_per_position?: number[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fastest_lap_points?: number
          id?: string
          name?: string
          points_per_position?: number[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          achievements: string | null
          approved: boolean
          avatar_url: string | null
          bio: string | null
          created_at: string
          discord_avatar_url: string | null
          display_name: string | null
          id: string
          lmu_name: string | null
          updated_at: string
        }
        Insert: {
          achievements?: string | null
          approved?: boolean
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          discord_avatar_url?: string | null
          display_name?: string | null
          id: string
          lmu_name?: string | null
          updated_at?: string
        }
        Update: {
          achievements?: string | null
          approved?: boolean
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          discord_avatar_url?: string | null
          display_name?: string | null
          id?: string
          lmu_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          age: number | null
          created_at: string
          discord_linked_at: string | null
          discord_server_nickname: string | null
          discord_user_id: string | null
          discord_username: string | null
          pending_discord_message_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          discord_linked_at?: string | null
          discord_server_nickname?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          pending_discord_message_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          created_at?: string
          discord_linked_at?: string | null
          discord_server_nickname?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          pending_discord_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      protest_involved: {
        Row: {
          created_at: string
          driver_name: string
          id: string
          protest_id: string
          responded_at: string | null
          response: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          driver_name: string
          id?: string
          protest_id: string
          responded_at?: string | null
          response?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          driver_name?: string
          id?: string
          protest_id?: string
          responded_at?: string | null
          response?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protest_involved_protest_id_fkey"
            columns: ["protest_id"]
            isOneToOne: false
            referencedRelation: "protests"
            referencedColumns: ["id"]
          },
        ]
      }
      protests: {
        Row: {
          corner: string | null
          created_at: string
          description: string
          division_id: string
          id: string
          involved_drivers: string | null
          lap_number: number | null
          ruled_at: string | null
          ruled_by: string | null
          status: Database["public"]["Enums"]["protest_status"]
          submitted_by: string
          verdict_details: Json
          verdict_outcome: Database["public"]["Enums"]["verdict_outcome"] | null
          verdict_reason: string | null
          video_url: string | null
        }
        Insert: {
          corner?: string | null
          created_at?: string
          description: string
          division_id: string
          id?: string
          involved_drivers?: string | null
          lap_number?: number | null
          ruled_at?: string | null
          ruled_by?: string | null
          status?: Database["public"]["Enums"]["protest_status"]
          submitted_by: string
          verdict_details?: Json
          verdict_outcome?:
            | Database["public"]["Enums"]["verdict_outcome"]
            | null
          verdict_reason?: string | null
          video_url?: string | null
        }
        Update: {
          corner?: string | null
          created_at?: string
          description?: string
          division_id?: string
          id?: string
          involved_drivers?: string | null
          lap_number?: number | null
          ruled_at?: string | null
          ruled_by?: string | null
          status?: Database["public"]["Enums"]["protest_status"]
          submitted_by?: string
          verdict_details?: Json
          verdict_outcome?:
            | Database["public"]["Enums"]["verdict_outcome"]
            | null
          verdict_reason?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protests_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ruleset_template_rules: {
        Row: {
          content: string
          created_at: string
          id: string
          section_number: string | null
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          section_number?: string | null
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          section_number?: string | null
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruleset_template_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ruleset_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ruleset_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      rulesets: {
        Row: {
          content: string
          created_at: string
          id: string
          league_id: string
          section_number: string | null
          sort_order: number
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          league_id: string
          section_number?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          league_id?: string
          section_number?: string | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rulesets_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_applications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["team_request_status"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["team_request_status"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["team_request_status"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string
          discord_channel_id: string | null
          discord_message_id: string | null
          id: string
          invited_by: string
          responded_at: string | null
          status: Database["public"]["Enums"]["team_request_status"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          invited_by: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["team_request_status"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          invited_by?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["team_request_status"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_member_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_ratings: {
        Row: {
          components: Json
          confidence: number
          percentile: number | null
          score: number
          team_id: string
          updated_at: string
        }
        Insert: {
          components?: Json
          confidence?: number
          percentile?: number | null
          score?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          components?: Json
          confidence?: number
          percentile?: number | null
          score?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_class_rating_history: {
        Row: {
          car_class: string
          components: Json | null
          confidence: number | null
          id: string
          percentile: number | null
          recorded_at: string
          score: number
          user_id: string
        }
        Insert: {
          car_class: string
          components?: Json | null
          confidence?: number | null
          id?: string
          percentile?: number | null
          recorded_at?: string
          score: number
          user_id: string
        }
        Update: {
          car_class?: string
          components?: Json | null
          confidence?: number | null
          id?: string
          percentile?: number | null
          recorded_at?: string
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      user_class_ratings: {
        Row: {
          car_class: string
          components: Json | null
          confidence: number
          created_at: string
          id: string
          percentile: number | null
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          car_class: string
          components?: Json | null
          confidence?: number
          created_at?: string
          id?: string
          percentile?: number | null
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          car_class?: string
          components?: Json | null
          confidence?: number
          created_at?: string
          id?: string
          percentile?: number | null
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_league_ratings: {
        Row: {
          car_class: string
          components: Json
          confidence: number
          league_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          car_class: string
          components?: Json
          confidence?: number
          league_id: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          car_class?: string
          components?: Json
          confidence?: number
          league_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_league_ratings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rating_history: {
        Row: {
          car_class: string | null
          delta: number | null
          id: string
          league_id: string | null
          recorded_at: string
          round: number | null
          score: number
          user_id: string
        }
        Insert: {
          car_class?: string | null
          delta?: number | null
          id?: string
          league_id?: string | null
          recorded_at?: string
          round?: number | null
          score: number
          user_id: string
        }
        Update: {
          car_class?: string | null
          delta?: number | null
          id?: string
          league_id?: string | null
          recorded_at?: string
          round?: number | null
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      user_ratings: {
        Row: {
          percentile: number | null
          races_count: number
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          percentile?: number | null
          races_count?: number
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          percentile?: number | null
          races_count?: number
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      division_absences_public: {
        Row: {
          created_at: string | null
          division_id: string | null
          id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          division_id?: string | null
          id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          division_id?: string | null
          id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_find_user_id_by_email: { Args: { _email: string }; Returns: string }
      allowed_categories_for_signup: {
        Args: { _car_class: string; _league_id: string; _user_id: string }
        Returns: Json
      }
      compute_team_score: { Args: { _team_id: string }; Returns: Json }
      compute_user_class_score: {
        Args: { _car_class: string; _user_id: string }
        Returns: Json
      }
      compute_user_league_score: {
        Args: { _car_class: string; _league_id: string; _user_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_profile_private: {
        Args: { _user_id: string }
        Returns: {
          age: number
          discord_username: string
        }[]
      }
      is_chat_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_track_layout: {
        Args: { _layout: string; _track: string }
        Returns: {
          layout: string
          track: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_all_elo: { Args: never; Returns: undefined }
      recompute_all_team_ratings: { Args: never; Returns: undefined }
      refresh_class_percentiles: {
        Args: { _car_class: string }
        Returns: undefined
      }
      refresh_team_percentiles: { Args: never; Returns: undefined }
      refresh_team_rating: { Args: { _team_id: string }; Returns: undefined }
      refresh_user_class_rating: {
        Args: { _car_class: string; _user_id: string }
        Returns: undefined
      }
      refresh_user_league_rating: {
        Args: { _car_class: string; _league_id: string; _user_id: string }
        Returns: undefined
      }
      refresh_user_rating_percentiles: { Args: never; Returns: undefined }
      upload_leaderboard_time_with_device_token: {
        Args: {
          _best_lap_ms: number
          _car_class: string
          _car_model: string
          _driver_name: string
          _layout: string
          _recorded_at: string
          _token: string
          _track: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "racer"
      protest_status: "open" | "ruled"
      reserve_offer_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "superseded"
      team_member_role: "owner" | "member"
      team_request_status: "pending" | "accepted" | "rejected"
      verdict_outcome:
        | "no_penalty"
        | "warning"
        | "time_penalty"
        | "position_penalty"
        | "disqualified"
        | "point_penalty"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "racer"],
      protest_status: ["open", "ruled"],
      reserve_offer_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "superseded",
      ],
      team_member_role: ["owner", "member"],
      team_request_status: ["pending", "accepted", "rejected"],
      verdict_outcome: [
        "no_penalty",
        "warning",
        "time_penalty",
        "position_penalty",
        "disqualified",
        "point_penalty",
      ],
    },
  },
} as const
