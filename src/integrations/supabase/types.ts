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
      ai_conversation_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_audit_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_participants: {
        Row: {
          added_by: string | null
          conversation_id: string
          created_at: string
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          permission?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_tags: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          archived: boolean
          created_at: string
          deleted_at: string | null
          id: string
          last_message_at: string | null
          message_count: number
          metadata: Json
          model: string | null
          organization_id: string | null
          pinned: boolean
          system_prompt: string | null
          title: string
          total_input_tokens: number
          total_output_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          message_count?: number
          metadata?: Json
          model?: string | null
          organization_id?: string | null
          pinned?: boolean
          system_prompt?: string | null
          title?: string
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          message_count?: number
          metadata?: Json
          model?: string | null
          organization_id?: string | null
          pinned?: boolean
          system_prompt?: string | null
          title?: string
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          input_tokens: number | null
          message_id: string | null
          metadata: Json
          model: string | null
          output_tokens: number | null
          parts: Json
          role: string
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          message_id?: string | null
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          parts?: Json
          role: string
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          message_id?: string | null
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          parts?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_export_jobs: {
        Row: {
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          downloaded_at: string | null
          error: string | null
          file_path: string | null
          filters: Json
          id: string
          organization_id: string
          requested_by: string
          row_count: number | null
          started_at: string | null
          status: string
          template: string | null
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          downloaded_at?: string | null
          error?: string | null
          file_path?: string | null
          filters?: Json
          id?: string
          organization_id: string
          requested_by: string
          row_count?: number | null
          started_at?: string | null
          status?: string
          template?: string | null
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          downloaded_at?: string | null
          error?: string | null
          file_path?: string | null
          filters?: Json
          id?: string
          organization_id?: string
          requested_by?: string
          row_count?: number | null
          started_at?: string | null
          status?: string
          template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_export_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount_limit: number
          category: string
          created_at: string
          id: string
          organization_id: string
          spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_limit: number
          category: string
          created_at?: string
          id?: string
          organization_id: string
          spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_limit?: number
          category?: string
          created_at?: string
          id?: string
          organization_id?: string
          spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_messages: {
        Row: {
          body: string
          client_nonce: string | null
          created_at: string
          id: string
          mentions: string[]
          organization_id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          client_nonce?: string | null
          created_at?: string
          id?: string
          mentions?: string[]
          organization_id: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          client_nonce?: string | null
          created_at?: string
          id?: string
          mentions?: string[]
          organization_id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "collab_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_read_receipts: {
        Row: {
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_read_receipts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "collab_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          organization_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_role_permissions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          organization_id: string
          permission_key: string
          role_slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          organization_id: string
          permission_key: string
          role_slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          organization_id?: string
          permission_key?: string
          role_slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          head_user_id: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          head_user_id?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          head_user_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          banking: Json | null
          created_at: string
          department_id: string | null
          emergency_contact: Json | null
          employee_code: string | null
          hire_date: string | null
          id: string
          insurance: Json | null
          job_title: string | null
          organization_id: string
          profile_completion: number
          reports_to: string | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          banking?: Json | null
          created_at?: string
          department_id?: string | null
          emergency_contact?: Json | null
          employee_code?: string | null
          hire_date?: string | null
          id?: string
          insurance?: Json | null
          job_title?: string | null
          organization_id: string
          profile_completion?: number
          reports_to?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          banking?: Json | null
          created_at?: string
          department_id?: string | null
          emergency_contact?: Json | null
          employee_code?: string | null
          hire_date?: string | null
          id?: string
          insurance?: Json | null
          job_title?: string | null
          organization_id?: string
          profile_completion?: number
          reports_to?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          id: string
          name: string
          organization_id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          date?: string
          id?: string
          name: string
          organization_id: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          asset_type: string
          avg_price: number
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          shares: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          avg_price?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          shares?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          avg_price?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          shares?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          join_code: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          join_code?: string | null
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          join_code?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          key: string
          label: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          key: string
          label: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      presence_telemetry: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          latency_ms: number | null
          metadata: Json
          organization_id: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          event_type: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          organization_id: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_telemetry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          active: boolean
          condition: string
          created_at: string
          id: string
          last_triggered_at: string | null
          name: string
          organization_id: string | null
          symbol: string
          target_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          condition?: string
          created_at?: string
          id?: string
          last_triggered_at?: string | null
          name?: string
          organization_id?: string | null
          symbol: string
          target_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          condition?: string
          created_at?: string
          id?: string
          last_triggered_at?: string | null
          name?: string
          organization_id?: string | null
          symbol?: string
          target_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          currency: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rbac_audit_log: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_value: Json | null
          organization_id: string
          previous_value: Json | null
          target_role: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_value?: Json | null
          organization_id: string
          previous_value?: Json | null
          target_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_value?: Json | null
          organization_id?: string
          previous_value?: Json | null
          target_role?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rbac_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          metadata: Json
          new_role: Database["public"]["Enums"]["app_role"] | null
          organization_id: string
          previous_role: Database["public"]["Enums"]["app_role"] | null
          reason: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_role?: Database["public"]["Enums"]["app_role"] | null
          organization_id: string
          previous_role?: Database["public"]["Enums"]["app_role"] | null
          reason?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_role?: Database["public"]["Enums"]["app_role"] | null
          organization_id?: string
          previous_role?: Database["public"]["Enums"]["app_role"] | null
          reason?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_change_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_manage: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_manage?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_manage?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_requests: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          organization_id: string
          reason: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          signup_config_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          signup_config_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          signup_config_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_signup_config_id_fkey"
            columns: ["signup_config_id"]
            isOneToOne: false
            referencedRelation: "signup_role_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          organization_id: string
          saved_amount: number
          target_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          name: string
          organization_id: string
          saved_amount?: number
          target_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          organization_id?: string
          saved_amount?: number
          target_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_audit_log: {
        Row: {
          changes: Json
          created_at: string
          id: string
          section: string
          user_id: string
        }
        Insert: {
          changes?: Json
          created_at?: string
          id?: string
          section: string
          user_id: string
        }
        Update: {
          changes?: Json
          created_at?: string
          id?: string
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      signup_role_configs: {
        Row: {
          created_at: string
          created_by: string | null
          current_user_count: number
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          label: string | null
          max_users: number | null
          organization_id: string
          requires_approval: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_user_count?: number
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_users?: number | null
          organization_id: string
          requires_approval?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_user_count?: number
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_users?: number | null
          organization_id?: string
          requires_approval?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_role_configs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_role_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          amount: number | null
          assigned_to: string
          category: string
          completed_at: string | null
          created_at: string
          created_by: string
          currency: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_to: string
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_to?: string
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          description: string | null
          id: string
          manager_user_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          description?: string | null
          id?: string
          manager_user_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          description?: string | null
          id?: string
          manager_user_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          notifications: Json | null
          preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notifications?: Json | null
          preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notifications?: Json | null
          preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_briefing_assignments: {
        Row: {
          assigned_at: string
          briefing_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          briefing_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          briefing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_briefing_assignments_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "voice_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_briefing_plays: {
        Row: {
          briefing_id: string
          completed: boolean
          id: string
          played_at: string
          user_id: string
        }
        Insert: {
          briefing_id: string
          completed?: boolean
          id?: string
          played_at?: string
          user_id: string
        }
        Update: {
          briefing_id?: string
          completed?: boolean
          id?: string
          played_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_briefing_plays_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "voice_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_briefings: {
        Row: {
          audio_url: string | null
          created_at: string
          created_by: string
          duration_seconds: number
          id: string
          metadata: Json
          organization_id: string
          script: string
          title: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          created_by: string
          duration_seconds?: number
          id?: string
          metadata?: Json
          organization_id: string
          script?: string
          title: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          created_by?: string
          duration_seconds?: number
          id?: string
          metadata?: Json
          organization_id?: string
          script?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          name: string
          organization_id: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_conversation_can_edit: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      ai_conversation_can_view: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      ai_conversation_owner: { Args: { _conv: string }; Returns: string }
      delete_custom_role: {
        Args: { _org: string; _slug: string }
        Returns: undefined
      }
      find_org_by_code: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
          type: string
        }[]
      }
      find_user_by_email: {
        Args: { _email: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      generate_join_code: { Args: never; Returns: string }
      get_active_org: { Args: { _user_id: string }; Returns: string }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_any_role: {
        Args: {
          _org_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: { _org_id: string; _perm_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      seed_system_roles: { Args: { _org: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      voice_briefing_has_assignments: {
        Args: { _briefing_id: string }
        Returns: boolean
      }
      voice_briefing_is_assigned: {
        Args: { _briefing_id: string; _user_id: string }
        Returns: boolean
      }
      voice_briefing_org: { Args: { _briefing_id: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "owner"
        | "accountant"
        | "analyst"
        | "viewer"
        | "ceo"
        | "cfo"
        | "finance_manager"
        | "accounting_manager"
        | "hr_manager"
        | "auditor"
        | "team_manager"
        | "employee"
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
      app_role: [
        "owner",
        "accountant",
        "analyst",
        "viewer",
        "ceo",
        "cfo",
        "finance_manager",
        "accounting_manager",
        "hr_manager",
        "auditor",
        "team_manager",
        "employee",
      ],
    },
  },
} as const
