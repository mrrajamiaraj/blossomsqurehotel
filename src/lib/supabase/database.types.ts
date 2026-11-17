// Generated from the Supabase schema — do not edit by hand.
// Regenerate: `npm run db:types` (linked project) or `npm run db:types:local`.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      booking_events: {
        Row: {
          actor: string | null
          actor_name: string
          booking_id: string
          created_at: string
          detail: Json
          id: number
          kind: string
        }
        Insert: {
          actor?: string | null
          actor_name: string
          booking_id: string
          created_at?: string
          detail?: Json
          id?: never
          kind: string
        }
        Update: {
          actor?: string | null
          actor_name?: string
          booking_id?: string
          created_at?: string
          detail?: Json
          id?: never
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          airport_pickup: boolean
          amount_paid_bdt: number
          arrival_window: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          check_in: string
          check_out: string
          checked_in_at: string | null
          checked_out_at: string | null
          children: number
          confirmed_at: string | null
          country: string | null
          created_at: string
          email: string | null
          guest_name: string
          id: string
          internal_notes: string | null
          nightly_rate_bdt: number
          payment_status: string
          phone: string
          reference: string
          room_id: string | null
          room_type_id: string
          rooms: number
          source: string
          special_requests: string | null
          status: string
          total_bdt: number
          updated_at: string
        }
        Insert: {
          adults: number
          airport_pickup?: boolean
          amount_paid_bdt?: number
          arrival_window?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          check_in: string
          check_out: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          children?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          guest_name: string
          id?: string
          internal_notes?: string | null
          nightly_rate_bdt: number
          payment_status?: string
          phone: string
          reference: string
          room_id?: string | null
          room_type_id: string
          rooms?: number
          source?: string
          special_requests?: string | null
          status?: string
          total_bdt: number
          updated_at?: string
        }
        Update: {
          adults?: number
          airport_pickup?: boolean
          amount_paid_bdt?: number
          arrival_window?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          check_in?: string
          check_out?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          children?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          guest_name?: string
          id?: string
          internal_notes?: string | null
          nightly_rate_bdt?: number
          payment_status?: string
          phone?: string
          reference?: string
          room_id?: string | null
          room_type_id?: string
          rooms?: number
          source?: string
          special_requests?: string | null
          status?: string
          total_bdt?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_settings: {
        Row: {
          cancellation_policy: string
          children_policy: string
          confirm_call_within: string
          id: number
          service_charge_percent: number | null
          updated_at: string
          vat_percent: number | null
        }
        Insert: {
          cancellation_policy?: string
          children_policy?: string
          confirm_call_within?: string
          id?: number
          service_charge_percent?: number | null
          updated_at?: string
          vat_percent?: number | null
        }
        Update: {
          cancellation_policy?: string
          children_policy?: string
          confirm_call_within?: string
          id?: number
          service_charge_percent?: number | null
          updated_at?: string
          vat_percent?: number | null
        }
        Relationships: []
      }
      room_types: {
        Row: {
          bed: string
          blurb: string
          created_at: string
          description: string
          features: string[]
          floor: string
          gallery: string[]
          id: string
          is_published: boolean
          name: string
          price_bdt: number
          rack_price_bdt: number | null
          size_sqft: number | null
          sleeps: number
          slug: string
          sort_order: number
          tag: string
          updated_at: string
          view: string
          weekend_price_bdt: number | null
        }
        Insert: {
          bed: string
          blurb: string
          created_at?: string
          description: string
          features?: string[]
          floor: string
          gallery?: string[]
          id?: string
          is_published?: boolean
          name: string
          price_bdt: number
          rack_price_bdt?: number | null
          size_sqft?: number | null
          sleeps?: number
          slug: string
          sort_order?: number
          tag: string
          updated_at?: string
          view?: string
          weekend_price_bdt?: number | null
        }
        Update: {
          bed?: string
          blurb?: string
          created_at?: string
          description?: string
          features?: string[]
          floor?: string
          gallery?: string[]
          id?: string
          is_published?: boolean
          name?: string
          price_bdt?: number
          rack_price_bdt?: number | null
          size_sqft?: number | null
          sleeps?: number
          slug?: string
          sort_order?: number
          tag?: string
          updated_at?: string
          view?: string
          weekend_price_bdt?: number | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string
          floor: string | null
          housekeeping: string
          id: string
          number: string
          out_of_service: boolean
          room_type_id: string
          service_note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor?: string | null
          housekeeping?: string
          id?: string
          number: string
          out_of_service?: boolean
          room_type_id: string
          service_note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor?: string | null
          housekeeping?: string
          id?: string
          number?: string
          out_of_service?: boolean
          room_type_id?: string
          service_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      // Added by 20261118090000_guest_services.sql (hand-written until `npm run db:types` is re-run).
      inquiries: {
        Row: {
          created_at: string
          email: string | null
          event_date: string | null
          guests: number | null
          handled_at: string | null
          handled_by: string | null
          id: string
          kind: string
          message: string
          name: string
          phone: string | null
          reference: string
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_date?: string | null
          guests?: number | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          message: string
          name: string
          phone?: string | null
          reference: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          event_date?: string | null
          guests?: number | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          message?: string
          name?: string
          phone?: string | null
          reference?: string
          status?: string
        }
        Relationships: []
      }
      booking_lookup_attempts: {
        Row: { created_at: string; id: number; reference: string }
        Insert: { created_at?: string; id?: never; reference: string }
        Update: { created_at?: string; id?: never; reference?: string }
        Relationships: []
      }
    }
    Views: {
      guest_summary: {
        Row: {
          email: string | null
          guest_name: string | null
          key: string | null
          last_check_in: string | null
          nights: number | null
          phone: string | null
          spend_bdt: number | null
          stays: number | null
          upcoming: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      _clean_room_number: { Args: { p_number: string }; Returns: string }
      _free_units: {
        Args: { p_exclude: string; p_in: string; p_out: string; p_type: string }
        Returns: number
      }
      _insert_booking: {
        Args: {
          p_adults: number
          p_airport_pickup: boolean
          p_arrival_window: string
          p_check_in: string
          p_check_out: string
          p_children: number
          p_country: string
          p_email: string
          p_guest_name: string
          p_internal_notes: string
          p_phone: string
          p_room_slug: string
          p_rooms: number
          p_source: string
          p_special_requests: string
          p_status: string
        }
        Returns: string
      }
      _is_weekend_night: { Args: { p_night: string }; Returns: boolean }
      _log: {
        Args: { p_booking: string; p_detail: Json; p_kind: string }
        Returns: undefined
      }
      _require_manager: { Args: never; Returns: undefined }
      _require_staff: { Args: never; Returns: undefined }
      _stay_total: {
        Args: { p_in: string; p_out: string; p_type: string }
        Returns: number
      }
      _type_still_fits: {
        Args: { p_fewer: number; p_type: string }
        Returns: boolean
      }
      admin_add_room: {
        Args: { p_floor: string; p_number: string; p_room_type: string }
        Returns: string
      }
      admin_assign_room: {
        Args: { p_booking: string; p_room: string }
        Returns: undefined
      }
      admin_create_booking: {
        Args: {
          p_adults: number
          p_airport_pickup: boolean
          p_check_in: string
          p_check_out: string
          p_children: number
          p_country: string
          p_email: string
          p_guest_name: string
          p_internal_notes: string
          p_phone: string
          p_room_slug: string
          p_rooms: number
          p_source: string
          p_special_requests: string
          p_status: string
        }
        Returns: string
      }
      admin_delete_room: { Args: { p_room: string }; Returns: undefined }
      admin_modify_booking: {
        Args: {
          p_adults: number
          p_booking: string
          p_check_in: string
          p_check_out: string
          p_children: number
          p_room_slug: string
          p_rooms: number
        }
        Returns: undefined
      }
      admin_record_payment: {
        Args: {
          p_amount: number
          p_booking: string
          p_method: string
          p_note: string
        }
        Returns: undefined
      }
      admin_set_status: {
        Args: { p_booking: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      admin_update_guest_details: {
        Args: {
          p_airport_pickup: boolean
          p_arrival_window: string
          p_booking: string
          p_email: string
          p_guest_name: string
          p_internal_notes: string
          p_phone: string
          p_special_requests: string
        }
        Returns: undefined
      }
      admin_update_room_unit: {
        Args: {
          p_floor: string
          p_number: string
          p_room: string
          p_room_type: string
        }
        Returns: undefined
      }
      create_booking: {
        Args: {
          p_adults: number
          p_airport_pickup: boolean
          p_arrival_window: string
          p_check_in: string
          p_check_out: string
          p_children: number
          p_country: string
          p_email: string
          p_guest_name: string
          p_phone: string
          p_room_slug: string
          p_rooms: number
          p_special_requests: string
        }
        Returns: string
      }
      admin_set_inquiry_status: {
        Args: { p_inquiry: string; p_status: string }
        Returns: undefined
      }
      lookup_booking: {
        Args: { p_contact: string; p_reference: string }
        Returns: {
          adults: number
          amount_paid_bdt: number
          check_in: string
          check_out: string
          children: number
          created_at: string
          guest_name: string
          payment_status: string
          reference: string
          room_name: string
          rooms: number
          status: string
          total_bdt: number
        }[]
      }
      submit_inquiry: {
        Args: {
          p_email: string
          p_event_date: string
          p_guests: number
          p_kind: string
          p_message: string
          p_name: string
          p_phone: string
        }
        Returns: string
      }
      is_manager: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      room_availability: {
        Args: { p_check_in: string; p_check_out: string }
        Returns: {
          available: number
          slug: string
        }[]
      }
      staff_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
