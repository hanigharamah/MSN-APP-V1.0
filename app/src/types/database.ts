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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      availability_blocks: {
        Row: {
          ends_at: string
          id: string
          provider_id: string
          reason: string | null
          starts_at: string
        }
        Insert: {
          ends_at: string
          id?: string
          provider_id: string
          reason?: string | null
          starts_at: string
        }
        Update: {
          ends_at?: string
          id?: string
          provider_id?: string
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          ends_time: string
          id: string
          provider_id: string
          starts_time: string
          timezone: string
          weekday: number
        }
        Insert: {
          ends_time: string
          id?: string
          provider_id: string
          starts_time: string
          timezone?: string
          weekday: number
        }
        Update: {
          ends_time?: string
          id?: string
          provider_id?: string
          starts_time?: string
          timezone?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancellation_window_hours: number
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          ends_at: string
          id: string
          idempotency_key: string | null
          meeting_url: string | null
          payment_bypassed: boolean
          platform_fee_cents: number
          provider_id: string
          provider_note: string | null
          rail: Database["public"]["Enums"]["payment_rail"]
          reference: string
          seeker_id: string
          seeker_note: string | null
          service_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          store_transaction_id: string | null
          stripe_payment_intent_id: string | null
          timezone: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          cancellation_window_hours: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          ends_at: string
          id?: string
          idempotency_key?: string | null
          meeting_url?: string | null
          payment_bypassed?: boolean
          platform_fee_cents?: number
          provider_id: string
          provider_note?: string | null
          rail: Database["public"]["Enums"]["payment_rail"]
          reference?: string
          seeker_id: string
          seeker_note?: string | null
          service_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          store_transaction_id?: string | null
          stripe_payment_intent_id?: string | null
          timezone?: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          cancellation_window_hours?: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          ends_at?: string
          id?: string
          idempotency_key?: string | null
          meeting_url?: string | null
          payment_bypassed?: boolean
          platform_fee_cents?: number
          provider_id?: string
          provider_note?: string | null
          rail?: Database["public"]["Enums"]["payment_rail"]
          reference?: string
          seeker_id?: string
          seeker_note?: string | null
          service_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          store_transaction_id?: string | null
          stripe_payment_intent_id?: string | null
          timezone?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_seeker_id_fkey"
            columns: ["seeker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          conversation_id: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          conversation_id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at: string | null
          last_message_preview: string | null
          last_message_sender_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_images: {
        Row: {
          event_id: string
          id: string
          sort_order: number
          url: string
        }
        Insert: {
          event_id: string
          id?: string
          sort_order?: number
          url: string
        }
        Update: {
          event_id?: string
          id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_images_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_occurrences: {
        Row: {
          capacity: number | null
          ends_at: string
          event_id: string
          id: string
          is_cancelled: boolean
          starts_at: string
        }
        Insert: {
          capacity?: number | null
          ends_at: string
          event_id: string
          id?: string
          is_cancelled?: boolean
          starts_at: string
        }
        Update: {
          capacity?: number | null
          ends_at?: string
          event_id?: string
          id?: string
          is_cancelled?: boolean
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          capacity: number | null
          category_id: string | null
          city: string | null
          country_code: string | null
          cover_url: string | null
          created_at: string
          currency: string
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          description: string | null
          ends_at: string
          hide_exact_address: boolean
          hide_meeting_url: boolean
          host_id: string
          id: string
          is_free: boolean
          is_recurring: boolean
          latitude: number | null
          longitude: number | null
          meeting_url: string | null
          min_age: number | null
          postal_code: string | null
          published_at: string | null
          region: string | null
          slug: string | null
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          summary: string | null
          timezone: string
          title: string
          updated_at: string
          venue_name: string | null
          video_url: string | null
          min_price_cents: number | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          capacity?: number | null
          category_id?: string | null
          city?: string | null
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          description?: string | null
          ends_at: string
          hide_exact_address?: boolean
          hide_meeting_url?: boolean
          host_id: string
          id?: string
          is_free?: boolean
          is_recurring?: boolean
          latitude?: number | null
          longitude?: number | null
          meeting_url?: string | null
          min_age?: number | null
          postal_code?: string | null
          published_at?: string | null
          region?: string | null
          slug?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          summary?: string | null
          timezone?: string
          title: string
          updated_at?: string
          venue_name?: string | null
          video_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          capacity?: number | null
          category_id?: string | null
          city?: string | null
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          description?: string | null
          ends_at?: string
          hide_exact_address?: boolean
          hide_meeting_url?: boolean
          host_id?: string
          id?: string
          is_free?: boolean
          is_recurring?: boolean
          latitude?: number | null
          longitude?: number | null
          meeting_url?: string | null
          min_age?: number | null
          postal_code?: string | null
          published_at?: string | null
          region?: string | null
          slug?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          summary?: string | null
          timezone?: string
          title?: string
          updated_at?: string
          venue_name?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          deep_link: string | null
          id: string
          kind: string
          payload: Json
          profile_id: string
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deep_link?: string | null
          id?: string
          kind: string
          payload?: Json
          profile_id: string
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deep_link?: string | null
          id?: string
          kind?: string
          payload?: Json
          profile_id?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          quantity: number
          ticket_type_id: string
          unit_price_cents: number
          unit_token_cost: number | null
        }
        Insert: {
          id?: string
          order_id: string
          quantity: number
          ticket_type_id: string
          unit_price_cents: number
          unit_token_cost?: number | null
        }
        Update: {
          id?: string
          order_id?: string
          quantity?: number
          ticket_type_id?: string
          unit_price_cents?: number
          unit_token_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          created_at: string
          currency: string
          discount_cents: number
          event_id: string
          id: string
          idempotency_key: string | null
          occurrence_id: string | null
          payment_bypassed: boolean
          platform_fee_cents: number
          purchased_at: string | null
          rail: Database["public"]["Enums"]["payment_rail"]
          reference: string
          status: Database["public"]["Enums"]["order_status"]
          store_transaction_id: string | null
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          currency?: string
          discount_cents?: number
          event_id: string
          id?: string
          idempotency_key?: string | null
          occurrence_id?: string | null
          payment_bypassed?: boolean
          platform_fee_cents?: number
          purchased_at?: string | null
          rail: Database["public"]["Enums"]["payment_rail"]
          reference?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_transaction_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          currency?: string
          discount_cents?: number
          event_id?: string
          id?: string
          idempotency_key?: string | null
          occurrence_id?: string | null
          payment_bypassed?: boolean
          platform_fee_cents?: number
          purchased_at?: string | null
          rail?: Database["public"]["Enums"]["payment_rail"]
          reference?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_transaction_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_specialities: {
        Row: {
          profile_id: string
          speciality_id: string
        }
        Insert: {
          profile_id: string
          speciality_id: string
        }
        Update: {
          profile_id?: string
          speciality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_specialities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_specialities_speciality_id_fkey"
            columns: ["speciality_id"]
            isOneToOne: false
            referencedRelation: "specialities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          bio: string | null
          city: string | null
          country_code: string | null
          cover_url: string | null
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          display_name: string
          email: string | null
          first_name: string | null
          handle: string | null
          headline: string | null
          hide_exact_location: boolean
          id: string
          is_admin: boolean
          is_certified: boolean
          is_suspended: boolean
          is_verified: boolean
          last_name: string | null
          latitude: number | null
          longitude: number | null
          onboarding_done: boolean
          phone: string | null
          postal_code: string | null
          profile_completion: number
          region: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          display_name: string
          email?: string | null
          first_name?: string | null
          handle?: string | null
          headline?: string | null
          hide_exact_location?: boolean
          id: string
          is_admin?: boolean
          is_certified?: boolean
          is_suspended?: boolean
          is_verified?: boolean
          last_name?: string | null
          latitude?: number | null
          longitude?: number | null
          onboarding_done?: boolean
          phone?: string | null
          postal_code?: string | null
          profile_completion?: number
          region?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          display_name?: string
          email?: string | null
          first_name?: string | null
          handle?: string | null
          headline?: string | null
          hide_exact_location?: boolean
          id?: string
          is_admin?: boolean
          is_certified?: boolean
          is_suspended?: boolean
          is_verified?: boolean
          last_name?: string | null
          latitude?: number | null
          longitude?: number | null
          onboarding_done?: boolean
          phone?: string | null
          postal_code?: string | null
          profile_completion?: number
          region?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      provider_details: {
        Row: {
          accepts_bookings: boolean
          created_at: string
          is_out_of_office: boolean
          languages: string[]
          legal_name: string | null
          out_of_office_until: string | null
          payouts_enabled: boolean
          profile_id: string
          stripe_account_id: string | null
          tax_id: string | null
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          accepts_bookings?: boolean
          created_at?: string
          is_out_of_office?: boolean
          languages?: string[]
          legal_name?: string | null
          out_of_office_until?: string | null
          payouts_enabled?: boolean
          profile_id: string
          stripe_account_id?: string | null
          tax_id?: string | null
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          accepts_bookings?: boolean
          created_at?: string
          is_out_of_office?: boolean
          languages?: string[]
          legal_name?: string | null
          out_of_office_until?: string | null
          payouts_enabled?: boolean
          profile_id?: string
          stripe_account_id?: string | null
          tax_id?: string | null
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          profile_id: string
          token: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          profile_id: string
          token: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          profile_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          acknowledged_at: string | null
          amount_cents: number | null
          booking_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          order_id: string | null
          processed_at: string | null
          reason: string
          requester_id: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          amount_cents?: number | null
          booking_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          order_id?: string | null
          processed_at?: string | null
          reason: string
          requester_id: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          amount_cents?: number | null
          booking_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          order_id?: string | null
          processed_at?: string | null
          reason?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          outcome: Database["public"]["Enums"]["report_outcome"] | null
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          subject_event_id: string | null
          subject_message_id: string | null
          subject_profile_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["report_outcome"] | null
          reason: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          subject_event_id?: string | null
          subject_message_id?: string | null
          subject_profile_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["report_outcome"] | null
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          subject_event_id?: string | null
          subject_message_id?: string | null
          subject_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_event_id_fkey"
            columns: ["subject_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_message_id_fkey"
            columns: ["subject_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_profile_id_fkey"
            columns: ["subject_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string | null
          booking_id: string | null
          created_at: string
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          order_id: string | null
          rating: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string | null
          booking_id?: string | null
          created_at?: string
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          order_id?: string | null
          rating: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          booking_id?: string | null
          created_at?: string
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          order_id?: string | null
          rating?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          profile_id: string
          provider_id: string | null
          service_id: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          profile_id: string
          provider_id?: string | null
          service_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          profile_id?: string
          provider_id?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_minutes: number
          cancellation_window_hours: number
          category_id: string | null
          cover_url: string | null
          created_at: string
          currency: string
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          price_cents: number
          provider_id: string
          requires_approval: boolean
          title: string
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          cancellation_window_hours?: number
          category_id?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          price_cents?: number
          provider_id: string
          requires_approval?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          cancellation_window_hours?: number
          category_id?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          price_cents?: number
          provider_id?: string
          requires_approval?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      specialities: {
        Row: {
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          max_per_order: number
          name: string
          price_cents: number
          quantity: number | null
          quantity_sold: number
          sales_end_at: string | null
          sales_start_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          max_per_order?: number
          name: string
          price_cents?: number
          quantity?: number | null
          quantity_sold?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          max_per_order?: number
          name?: string
          price_cents?: number
          quantity?: number | null
          quantity_sold?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          attendee_email: string | null
          attendee_name: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          created_at: string
          event_id: string
          holder_id: string | null
          id: string
          is_void: boolean
          order_item_id: string
          photo_consent: boolean | null
          photo_consent_at: string | null
        }
        Insert: {
          attendee_email?: string | null
          attendee_name?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id: string
          holder_id?: string | null
          id?: string
          is_void?: boolean
          order_item_id: string
          photo_consent?: boolean | null
          photo_consent_at?: string | null
        }
        Update: {
          attendee_email?: string | null
          attendee_name?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id?: string
          holder_id?: string | null
          id?: string
          is_void?: boolean
          order_item_id?: string
          photo_consent?: boolean | null
          photo_consent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_deletion_blockers: {
        Args: { p_profile?: string }
        Returns: {
          detail: string
          kind: string
          occurs_at: string
        }[]
      }
      admin_money_summary: {
        Args: never
        Returns: {
          bypassed_cents: number
          bypassed_count: number
          currency: string
          gross_cents: number
          owed_cents: number
          platform_fee_cents: number
          transaction_count: number
        }[]
      }
      admin_organiser_balances: {
        Args: { limit_n?: number }
        Returns: {
          avatar_url: string
          bypassed_count: number
          currency: string
          display_name: string
          gross_cents: number
          handle: string
          owed_cents: number
          profile_id: string
          transaction_count: number
        }[]
      }
      admin_recent_transactions: {
        Args: { limit_n?: number }
        Returns: {
          bypassed: boolean
          counterparty: string
          currency: string
          id: string
          kind: string
          occurred_at: string
          rail: Database["public"]["Enums"]["payment_rail"]
          reference: string
          subject: string
          total_cents: number
        }[]
      }
      auth_account_type: {
        Args: never
        Returns: Database["public"]["Enums"]["account_type"]
      }
      auth_in_conversation: {
        Args: { p_conversation: string }
        Returns: boolean
      }
      auth_is_admin: { Args: never; Returns: boolean }
      available_slots: {
        Args: {
          from_date: string
          provider: string
          service: string
          to_date: string
        }
        Returns: {
          slot_end: string
          slot_start: string
        }[]
      }
      become_practitioner: {
        Args: never
        Returns: Database["public"]["Enums"]["account_type"]
      }
      cancel_account_deletion: { Args: never; Returns: undefined }
      check_in_ticket: {
        Args: { p_code: string; p_event: string }
        Returns: {
          attendee_name: string
          checked_in_at: string
          status: string
          ticket_id: string
        }[]
      }
      deletion_sweep_status: {
        Args: never
        Returns: {
          cron_available: boolean
          overdue_count: number
          pending_count: number
          schedule: string
          scheduled: boolean
        }[]
      }
      earth: { Args: never; Returns: number }
      event_min_price_cents: { Args: { p_event: string }; Returns: number }
      events_search_doc: {
        Args: { description: string; summary: string; title: string }
        Returns: unknown
      }
      finalise_account_deletion: {
        Args: { p_profile: string }
        Returns: undefined
      }
      is_blocked_between: { Args: { p_other: string }; Returns: boolean }
      min_price_cents: {
        Args: { "": Database["public"]["Tables"]["events"]["Row"] }
        Returns: {
          error: true
        } & "the function public.min_price_cents with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      profiles_search_doc: {
        Args: { bio: string; display_name: string; headline: string }
        Returns: unknown
      }
      provider_rating: {
        Args: { p_profile: string }
        Returns: {
          average: number
          total: number
        }[]
      }
      request_account_deletion: { Args: never; Returns: string }
      run_account_deletions: { Args: never; Returns: number }
      search_events: {
        Args: {
          category?: string
          from_date?: string
          limit_n?: number
          near_lat?: number
          near_lng?: number
          offset_n?: number
          q?: string
          radius_km?: number
        }
        Returns: {
          category_id: string
          city: string
          country_code: string
          cover_url: string
          currency: string
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          distance_km: number
          ends_at: string
          host_avatar_url: string
          host_display_name: string
          host_handle: string
          host_id: string
          host_is_verified: boolean
          id: string
          is_free: boolean
          latitude: number
          longitude: number
          min_price_cents: number
          region: string
          relevance: number
          slug: string
          starts_at: string
          summary: string
          timezone: string
          title: string
          venue_name: string
        }[]
      }
      search_providers: {
        Args: {
          limit_n?: number
          near_lat?: number
          near_lng?: number
          offset_n?: number
          q?: string
          radius_km?: number
          speciality?: string
        }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string
          city: string
          country_code: string
          cover_url: string
          display_name: string
          distance_km: number
          handle: string
          headline: string
          id: string
          is_certified: boolean
          is_verified: boolean
          latitude: number
          longitude: number
          rating_average: number
          rating_count: number
          region: string
          relevance: number
        }[]
      }
      set_event_photo_consent: {
        Args: { p_consent: boolean; p_event: string }
        Returns: number
      }
      set_photo_consent: {
        Args: { p_consent: boolean; p_ticket: string }
        Returns: {
          attendee_email: string | null
          attendee_name: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          created_at: string
          event_id: string
          holder_id: string | null
          id: string
          is_void: boolean
          order_item_id: string
          photo_consent: boolean | null
          photo_consent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_direct_conversation: {
        Args: { p_booking?: string; p_other: string }
        Returns: string
      }
      unread_counts: {
        Args: { p_profile?: string }
        Returns: {
          unread_messages: number
          unread_notifications: number
        }[]
      }
    }
    Enums: {
      account_type:
        | "seeker"
        | "practitioner"
        | "business"
        | "venue"
        | "nonprofit"
        | "organizer"
      booking_status:
        | "requested"
        | "confirmed"
        | "declined"
        | "cancelled_by_seeker"
        | "cancelled_by_provider"
        | "completed"
        | "no_show"
      conversation_kind: "direct" | "booking" | "event"
      delivery_mode: "in_person" | "online_live" | "one_to_one"
      event_status:
        | "draft"
        | "published"
        | "cancelled"
        | "completed"
        | "archived"
      order_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "cancelled"
      payment_rail: "stripe" | "apple_iap" | "google_play"
      refund_status: "requested" | "approved" | "declined" | "processed"
      report_outcome: "upheld" | "dismissed" | "duplicate"
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
      account_type: [
        "seeker",
        "practitioner",
        "business",
        "venue",
        "nonprofit",
        "organizer",
      ],
      booking_status: [
        "requested",
        "confirmed",
        "declined",
        "cancelled_by_seeker",
        "cancelled_by_provider",
        "completed",
        "no_show",
      ],
      conversation_kind: ["direct", "booking", "event"],
      delivery_mode: ["in_person", "online_live", "one_to_one"],
      event_status: [
        "draft",
        "published",
        "cancelled",
        "completed",
        "archived",
      ],
      order_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "cancelled",
      ],
      payment_rail: ["stripe", "apple_iap", "google_play"],
      refund_status: ["requested", "approved", "declined", "processed"],
      report_outcome: ["upheld", "dismissed", "duplicate"],
    },
  },
} as const

// =============================================================================
// App-facing aliases
// =============================================================================
// Everything above this line is generated by `supabase gen types typescript
// --linked` and must not be hand-edited — regenerate instead.
//
// Below are the names the app imports. Enum aliases are DERIVED from the
// generated `Enums<>` rather than restated as string unions, so they cannot
// drift from the database the way the previous hand-written file did (it still
// listed a `tokens` payment rail after that enum member was dropped).
// =============================================================================

// --- Enums -------------------------------------------------------------------
export type AccountType = Enums<'account_type'>;
export type EventStatus = Enums<'event_status'>;
export type DeliveryMode = Enums<'delivery_mode'>;
export type OrderStatus = Enums<'order_status'>;
export type ReportOutcome = Enums<'report_outcome'>;
export type BookingStatus = Enums<'booking_status'>;
export type RefundStatus = Enums<'refund_status'>;
export type PaymentRail = Enums<'payment_rail'>;
export type ConversationKind = Enums<'conversation_kind'>;

/** `push_tokens.platform` is a CHECK constraint, not a Postgres enum. */
export type PushPlatform = 'ios' | 'android' | 'web';

// --- Identity ----------------------------------------------------------------
export type Profile = Tables<'profiles'>;
export type ProfileInsert = TablesInsert<'profiles'>;
export type ProfileUpdate = TablesUpdate<'profiles'>;
export type ProviderDetails = Tables<'provider_details'>;
export type ProviderDetailsInsert = TablesInsert<'provider_details'>;
export type ProviderDetailsUpdate = TablesUpdate<'provider_details'>;
export type PushToken = Tables<'push_tokens'>;
export type PushTokenInsert = TablesInsert<'push_tokens'>;

// --- Catalog -----------------------------------------------------------------
export type Category = Tables<'categories'>;
export type Speciality = Tables<'specialities'>;
export type ProfileSpeciality = Tables<'profile_specialities'>;
export type EventRow = Tables<'events'>;
export type EventInsert = TablesInsert<'events'>;
export type EventUpdate = TablesUpdate<'events'>;
export type EventOccurrence = Tables<'event_occurrences'>;
export type EventImage = Tables<'event_images'>;
export type TicketType = Tables<'ticket_types'>;
export type TicketTypeInsert = TablesInsert<'ticket_types'>;
export type TicketTypeUpdate = TablesUpdate<'ticket_types'>;
export type Service = Tables<'services'>;
export type ServiceInsert = TablesInsert<'services'>;
export type ServiceUpdate = TablesUpdate<'services'>;
export type AvailabilityRule = Tables<'availability_rules'>;
export type AvailabilityRuleInsert = TablesInsert<'availability_rules'>;
export type AvailabilityBlock = Tables<'availability_blocks'>;
export type AvailabilityBlockInsert = TablesInsert<'availability_blocks'>;

// --- Commerce ----------------------------------------------------------------
export type Order = Tables<'orders'>;
export type OrderInsert = TablesInsert<'orders'>;
export type OrderUpdate = TablesUpdate<'orders'>;
export type OrderItem = Tables<'order_items'>;
export type OrderItemInsert = TablesInsert<'order_items'>;
export type Ticket = Tables<'tickets'>;
export type TicketUpdate = TablesUpdate<'tickets'>;
export type Booking = Tables<'bookings'>;
export type BookingInsert = TablesInsert<'bookings'>;
export type BookingUpdate = TablesUpdate<'bookings'>;
export type RefundRequest = Tables<'refund_requests'>;
export type RefundRequestInsert = TablesInsert<'refund_requests'>;

// --- Social and messaging ----------------------------------------------------
export type Follow = Tables<'follows'>;
export type SavedItem = Tables<'saved_items'>;
export type SavedItemInsert = TablesInsert<'saved_items'>;
export type Review = Tables<'reviews'>;
export type ReviewInsert = TablesInsert<'reviews'>;
export type Conversation = Tables<'conversations'>;
export type ConversationParticipant = Tables<'conversation_participants'>;
export type Message = Tables<'messages'>;
export type MessageInsert = TablesInsert<'messages'>;
export type Notification = Tables<'notifications'>;
export type Report = Tables<'reports'>;
export type ReportInsert = TablesInsert<'reports'>;
export type BlockedUser = Tables<'blocked_users'>;

// --- Predicates and constants ------------------------------------------------

/** Account types that can list offerings and take bookings. */
export const PROVIDER_ACCOUNT_TYPES = [
  'practitioner',
  'business',
  'venue',
  'nonprofit',
  'organizer',
] as const satisfies readonly AccountType[];

export function isProviderAccount(accountType: AccountType): boolean {
  return (PROVIDER_ACCOUNT_TYPES as readonly AccountType[]).includes(accountType);
}

/** Statuses that mean the booking is over and no longer actionable. */
export const TERMINAL_BOOKING_STATUSES = [
  'declined',
  'cancelled_by_seeker',
  'cancelled_by_provider',
  'completed',
  'no_show',
] as const satisfies readonly BookingStatus[];

/**
 * Rails where the app store is the merchant. Only the store can refund these —
 * neither MSN nor the practitioner can, whatever a policy says.
 */
export function isStoreRail(rail: PaymentRail): rail is 'apple_iap' | 'google_play' {
  return rail === 'apple_iap' || rail === 'google_play';
}
