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
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_fk_id: string | null
          customer_id: string | null
          customer_name: string | null
          external_thread_id: string | null
          id: string
          platform: string
          social_connection_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_fk_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          external_thread_id?: string | null
          id?: string
          platform: string
          social_connection_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_fk_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          external_thread_id?: string | null
          id?: string
          platform?: string
          social_connection_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_fk_id_fkey"
            columns: ["customer_fk_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_social_connection_id_fkey"
            columns: ["social_connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          external_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          external_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          external_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          content: string
          conversation_id: string
          created_at: string
          delivery_status: string | null
          direction: string
          error_detail: string | null
          external_message_id: string | null
          id: string
          is_read: boolean
          message_type: string
          social_connection_id: string | null
          tenant_id: string
        }
        Insert: {
          attachment_url?: string | null
          content: string
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          error_detail?: string | null
          external_message_id?: string | null
          id?: string
          is_read?: boolean
          message_type?: string
          social_connection_id?: string | null
          tenant_id: string
        }
        Update: {
          attachment_url?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          error_detail?: string | null
          external_message_id?: string | null
          id?: string
          is_read?: boolean
          message_type?: string
          social_connection_id?: string | null
          tenant_id?: string
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
            foreignKeyName: "messages_social_connection_id_fkey"
            columns: ["social_connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          platform: string
          redirect_scheme: string
          state: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          platform: string
          redirect_scheme?: string
          state: string
          tenant_id: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          platform?: string
          redirect_scheme?: string
          state?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          agent_id: string | null
          cancelled_reason: string | null
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          delivery_address: string | null
          delivery_fee: number
          discount: number
          id: string
          status: string
          tenant_id: string
          total_amount: number
        }
        Insert: {
          agent_id?: string | null
          cancelled_reason?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          discount?: number
          id?: string
          status?: string
          tenant_id: string
          total_amount?: number
        }
        Update: {
          agent_id?: string | null
          cancelled_reason?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          discount?: number
          id?: string
          status?: string
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          alert_threshold: number
          cost_price: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_urls: string[]
          name: string
          price: number
          stock_quantity: number
          tenant_id: string
        }
        Insert: {
          alert_threshold?: number
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[]
          name: string
          price: number
          stock_quantity?: number
          tenant_id: string
        }
        Update: {
          alert_threshold?: number
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[]
          name?: string
          price?: number
          stock_quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          tenant_id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          tenant_id: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          tenant_id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token_enc: string | null
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          display_name: string | null
          external_account_id: string | null
          id: string
          last_webhook_at: string | null
          metadata: Json
          platform: string
          refresh_token_enc: string | null
          scopes: string[] | null
          status: string
          tenant_id: string
          token_expires_at: string | null
          waba_id: string | null
        }
        Insert: {
          access_token_enc?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          last_webhook_at?: string | null
          metadata?: Json
          platform: string
          refresh_token_enc?: string | null
          scopes?: string[] | null
          status?: string
          tenant_id: string
          token_expires_at?: string | null
          waba_id?: string | null
        }
        Update: {
          access_token_enc?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          last_webhook_at?: string | null
          metadata?: Json
          platform?: string
          refresh_token_enc?: string | null
          scopes?: string[] | null
          status?: string
          tenant_id?: string
          token_expires_at?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          country: string | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          plan: string
          sector: string | null
          status: string
          whatsapp_number: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          plan?: string
          sector?: string | null
          status?: string
          whatsapp_number?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          plan?: string
          sector?: string | null
          status?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error_detail: string | null
          external_event_id: string | null
          id: string
          payload_hash: string
          platform: string
          processed_at: string | null
          raw_payload: Json
          received_at: string
          social_connection_id: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          error_detail?: string | null
          external_event_id?: string | null
          id?: string
          payload_hash: string
          platform: string
          processed_at?: string | null
          raw_payload: Json
          received_at?: string
          social_connection_id?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          error_detail?: string | null
          external_event_id?: string | null
          id?: string
          payload_hash?: string
          platform?: string
          processed_at?: string | null
          raw_payload?: Json
          received_at?: string
          social_connection_id?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_social_connection_id_fkey"
            columns: ["social_connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_product_stock: {
        Args: {
          p_delta: number
          p_product_id: string
          p_reason: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: {
          alert_threshold: number
          cost_price: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_urls: string[]
          name: string
          price: number
          stock_quantity: number
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_initial_tenant: {
        Args: {
          p_country: string
          p_currency: string
          p_name: string
          p_sector: string
        }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      get_top_products: {
        Args: { p_limit?: number; p_tenant_id: string }
        Returns: {
          name: string
          product_id: string
          total_sold: number
        }[]
      }
      transition_order_status: {
        Args: {
          p_cancelled_reason?: string
          p_new_status: string
          p_order_id: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: {
          agent_id: string | null
          cancelled_reason: string | null
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          delivery_address: string | null
          delivery_fee: number
          discount: number
          id: string
          status: string
          tenant_id: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
    Enums: {},
  },
} as const
