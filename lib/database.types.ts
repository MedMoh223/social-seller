// Mirrors the output of `supabase gen types typescript`.
// Regenerate after schema changes, e.g.:
//   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
// Do not hand-edit literal unions for `text` + check-constraint columns
// (role, platform, status, direction) — the real generator emits `string`
// for those since they are not native Postgres enums.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          plan: string;
          status: string;
          whatsapp_number: string | null;
          owner_id: string | null;
          country: string | null;
          currency: string | null;
          sector: string | null;
          logo_url: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          plan?: string;
          status?: string;
          whatsapp_number?: string | null;
          owner_id?: string | null;
          country?: string | null;
          currency?: string | null;
          sector?: string | null;
          logo_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          plan?: string;
          status?: string;
          whatsapp_number?: string | null;
          owner_id?: string | null;
          country?: string | null;
          currency?: string | null;
          sector?: string | null;
          logo_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          role: string;
          phone: string | null;
          full_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          role: string;
          phone?: string | null;
          full_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          role?: string;
          phone?: string | null;
          full_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'users_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      social_connections: {
        Row: {
          id: string;
          tenant_id: string;
          platform: string;
          access_token: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          platform: string;
          access_token?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          platform?: string;
          access_token?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'social_connections_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          tenant_id: string;
          platform: string;
          customer_name: string | null;
          customer_id: string | null;
          assigned_to: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          platform: string;
          customer_name?: string | null;
          customer_id?: string | null;
          assigned_to?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          platform?: string;
          customer_name?: string | null;
          customer_id?: string | null;
          assigned_to?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          tenant_id: string;
          direction: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          tenant_id: string;
          direction: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          tenant_id?: string;
          direction?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          description: string | null;
          price: number;
          stock_quantity: number;
          alert_threshold: number;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          description?: string | null;
          price: number;
          stock_quantity?: number;
          alert_threshold?: number;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          stock_quantity?: number;
          alert_threshold?: number;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          tenant_id: string;
          conversation_id: string | null;
          agent_id: string | null;
          customer_name: string | null;
          total_amount: number;
          status: string;
          cancelled_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_id?: string | null;
          agent_id?: string | null;
          customer_name?: string | null;
          total_amount?: number;
          status?: string;
          cancelled_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_id?: string | null;
          agent_id?: string | null;
          customer_name?: string | null;
          total_amount?: number;
          status?: string;
          cancelled_reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string | null;
          action: string;
          table_name: string;
          record_id: string | null;
          old_value: Json | null;
          new_value: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id?: string | null;
          action: string;
          table_name: string;
          record_id?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string | null;
          action?: string;
          table_name?: string;
          record_id?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_initial_tenant: {
        Args: {
          p_name: string
          p_country: string
          p_currency: string
          p_sector: string
        }
        Returns: string
      };
      current_tenant_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
