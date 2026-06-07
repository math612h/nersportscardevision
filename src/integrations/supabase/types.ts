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
          updated_at: string
        }
        Insert: {
          division_id: string
          lobby_code?: string | null
          lobby_password?: string | null
          updated_at?: string
        }
        Update: {
          division_id?: string
          lobby_code?: string | null
          lobby_password?: string | null
          updated_at?: string
        }
        Relationships: []
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
      leagues: {
        Row: {
          banner_url: string | null
          car_class: string | null
          class_configs: Json
          created_at: string
          created_by: string | null
          description: string | null
          driver_category: string | null
          event_settings: Json
          id: string
          is_offseason: boolean
          name: string
          points_system: Json
          signup_opens_at: string | null
        }
        Insert: {
          banner_url?: string | null
          car_class?: string | null
          class_configs?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          driver_category?: string | null
          event_settings?: Json
          id?: string
          is_offseason?: boolean
          name: string
          points_system?: Json
          signup_opens_at?: string | null
        }
        Update: {
          banner_url?: string | null
          car_class?: string | null
          class_configs?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          driver_category?: string | null
          event_settings?: Json
          id?: string
          is_offseason?: boolean
          name?: string
          points_system?: Json
          signup_opens_at?: string | null
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
          discord_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          discord_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          created_at?: string
          discord_username?: string | null
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
          id: string
          invited_by: string
          responded_at: string | null
          status: Database["public"]["Enums"]["team_request_status"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["team_request_status"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
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
      team_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
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
      get_profile_private: {
        Args: { _user_id: string }
        Returns: {
          age: number
          discord_username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "racer"
      protest_status: "open" | "ruled"
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
