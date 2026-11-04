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
      arbitrage_opportunities: {
        Row: {
          detected_at: string
          direction: string
          gross_spread_pct: number
          id: string
          kalshi_price_yes: number
          liquidity_at_spread_usd: number
          matched_event_id: string
          net_spread_pct: number
          poly_price_yes: number
        }
        Insert: {
          detected_at?: string
          direction?: string
          gross_spread_pct?: number
          id?: string
          kalshi_price_yes?: number
          liquidity_at_spread_usd?: number
          matched_event_id: string
          net_spread_pct?: number
          poly_price_yes?: number
        }
        Update: {
          detected_at?: string
          direction?: string
          gross_spread_pct?: number
          id?: string
          kalshi_price_yes?: number
          liquidity_at_spread_usd?: number
          matched_event_id?: string
          net_spread_pct?: number
          poly_price_yes?: number
        }
        Relationships: [
          {
            foreignKeyName: "arbitrage_opportunities_matched_event_id_fkey"
            columns: ["matched_event_id"]
            isOneToOne: false
            referencedRelation: "matched_events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_telemetry_logs: {
        Row: {
          action_type: string
          actor_id: string
          id: string
          ip_address: string
          metadata: Json
          organization_id: string
          timestamp: string
        }
        Insert: {
          action_type: string
          actor_id: string
          id?: string
          ip_address?: string
          metadata?: Json
          organization_id: string
          timestamp?: string
        }
        Update: {
          action_type?: string
          actor_id?: string
          id?: string
          ip_address?: string
          metadata?: Json
          organization_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_telemetry_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_trading_vaults: {
        Row: {
          auto_hedge_enabled: boolean
          created_at: string
          id: string
          is_active: boolean
          lead_account_id: string | null
          lead_trader_id: string
          max_slippage_tolerance_pct: number
          name: string
          organization_id: string | null
          target_allocation_usd: number
        }
        Insert: {
          auto_hedge_enabled?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          lead_account_id?: string | null
          lead_trader_id: string
          max_slippage_tolerance_pct?: number
          name: string
          organization_id?: string | null
          target_allocation_usd?: number
        }
        Update: {
          auto_hedge_enabled?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          lead_account_id?: string | null
          lead_trader_id?: string
          max_slippage_tolerance_pct?: number
          name?: string
          organization_id?: string | null
          target_allocation_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "copy_trading_vaults_lead_account_id_fkey"
            columns: ["lead_account_id"]
            isOneToOne: false
            referencedRelation: "venue_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_trading_vaults_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_logs: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["execution_event_type"]
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["execution_event_type"]
          id?: string
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["execution_event_type"]
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      execution_webhooks: {
        Row: {
          created_at: string
          dry_run: boolean
          event_trigger: Database["public"]["Enums"]["webhook_trigger"]
          id: string
          is_active: boolean
          name: string
          secret_hint: string
          secret_key_hash: string
          target_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dry_run?: boolean
          event_trigger: Database["public"]["Enums"]["webhook_trigger"]
          id?: string
          is_active?: boolean
          name?: string
          secret_hint?: string
          secret_key_hash: string
          target_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dry_run?: boolean
          event_trigger?: Database["public"]["Enums"]["webhook_trigger"]
          id?: string
          is_active?: boolean
          name?: string
          secret_hint?: string
          secret_key_hash?: string
          target_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historical_snapshots: {
        Row: {
          id: string
          net_fees_usd: number
          realized_pnl_usd: number
          timestamp: string
          total_equity_usd: number
          unrealized_pnl_usd: number
          user_id: string
        }
        Insert: {
          id?: string
          net_fees_usd?: number
          realized_pnl_usd?: number
          timestamp?: string
          total_equity_usd?: number
          unrealized_pnl_usd?: number
          user_id: string
        }
        Update: {
          id?: string
          net_fees_usd?: number
          realized_pnl_usd?: number
          timestamp?: string
          total_equity_usd?: number
          unrealized_pnl_usd?: number
          user_id?: string
        }
        Relationships: []
      }
      matched_events: {
        Row: {
          category: Database["public"]["Enums"]["market_category"]
          created_at: string
          event_name: string
          id: string
          kalshi_ticker: string | null
          normalized_outcomes_map: Json
          polymarket_condition_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["market_category"]
          created_at?: string
          event_name: string
          id: string
          kalshi_ticker?: string | null
          normalized_outcomes_map?: Json
          polymarket_condition_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["market_category"]
          created_at?: string
          event_name?: string
          id?: string
          kalshi_ticker?: string | null
          normalized_outcomes_map?: Json
          polymarket_condition_id?: string | null
        }
        Relationships: []
      }
      org_account_assignments: {
        Row: {
          added_by: string
          assigned_to: string | null
          created_at: string
          id: string
          label: string
          organization_id: string
          venue: Database["public"]["Enums"]["venue"]
          venue_account_id: string
        }
        Insert: {
          added_by: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          label: string
          organization_id: string
          venue: Database["public"]["Enums"]["venue"]
          venue_account_id: string
        }
        Update: {
          added_by?: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          venue?: Database["public"]["Enums"]["venue"]
          venue_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_account_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_account_assignments_venue_account_id_fkey"
            columns: ["venue_account_id"]
            isOneToOne: false
            referencedRelation: "venue_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          venue_permissions: Json
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          venue_permissions?: Json
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          venue_permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          email: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
          venue_permissions: Json
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
          venue_permissions?: Json
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
          venue_permissions?: Json
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
          id: string
          name: string
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          slug?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          account_id: string
          avg_buy_price: number
          current_price: number
          fees_paid: number
          id: string
          market_key: string
          market_title: string
          matched_event_id: string | null
          outcome: string
          realized_pnl: number
          settlement_date: string | null
          shares: number
          updated_at: string
          user_id: string
          venue: Database["public"]["Enums"]["venue"]
        }
        Insert: {
          account_id: string
          avg_buy_price?: number
          current_price?: number
          fees_paid?: number
          id?: string
          market_key: string
          market_title: string
          matched_event_id?: string | null
          outcome: string
          realized_pnl?: number
          settlement_date?: string | null
          shares?: number
          updated_at?: string
          user_id: string
          venue: Database["public"]["Enums"]["venue"]
        }
        Update: {
          account_id?: string
          avg_buy_price?: number
          current_price?: number
          fees_paid?: number
          id?: string
          market_key?: string
          market_title?: string
          matched_event_id?: string | null
          outcome?: string
          realized_pnl?: number
          settlement_date?: string | null
          shares?: number
          updated_at?: string
          user_id?: string
          venue?: Database["public"]["Enums"]["venue"]
        }
        Relationships: [
          {
            foreignKeyName: "positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "venue_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_matched_event_id_fkey"
            columns: ["matched_event_id"]
            isOneToOne: false
            referencedRelation: "matched_events"
            referencedColumns: ["id"]
          },
        ]
      }
      proof_keys: {
        Row: {
          created_at: string
          id: number
          private_jwk: Json
          public_jwk: Json
        }
        Insert: {
          created_at?: string
          id?: number
          private_jwk: Json
          public_jwk: Json
        }
        Update: {
          created_at?: string
          id?: number
          private_jwk?: Json
          public_jwk?: Json
        }
        Relationships: []
      }
      public_portfolios: {
        Row: {
          created_at: string
          display_name: string
          handle: string
          hide_absolute_values: boolean
          holdings: Json
          id: string
          is_public: boolean
          net_pnl_usd: number | null
          proof_payload: string | null
          proof_signature: string | null
          sharpe_ratio: number | null
          show_holdings: boolean
          show_roi: boolean
          total_roi_pct: number | null
          total_volume_usd: number | null
          user_id: string
          verified_at: string | null
          win_rate_pct: number | null
        }
        Insert: {
          created_at?: string
          display_name?: string
          handle: string
          hide_absolute_values?: boolean
          holdings?: Json
          id?: string
          is_public?: boolean
          net_pnl_usd?: number | null
          proof_payload?: string | null
          proof_signature?: string | null
          sharpe_ratio?: number | null
          show_holdings?: boolean
          show_roi?: boolean
          total_roi_pct?: number | null
          total_volume_usd?: number | null
          user_id: string
          verified_at?: string | null
          win_rate_pct?: number | null
        }
        Update: {
          created_at?: string
          display_name?: string
          handle?: string
          hide_absolute_values?: boolean
          holdings?: Json
          id?: string
          is_public?: boolean
          net_pnl_usd?: number | null
          proof_payload?: string | null
          proof_signature?: string | null
          sharpe_ratio?: number | null
          show_holdings?: boolean
          show_roi?: boolean
          total_roi_pct?: number | null
          total_volume_usd?: number | null
          user_id?: string
          verified_at?: string | null
          win_rate_pct?: number | null
        }
        Relationships: []
      }
      user_fee_profiles: {
        Row: {
          custom_gas_offset_usd: number
          id: string
          kalshi_fee_tier: string
          polymarket_tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          custom_gas_offset_usd?: number
          id?: string
          kalshi_fee_tier?: string
          polymarket_tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          custom_gas_offset_usd?: number
          id?: string
          kalshi_fee_tier?: string
          polymarket_tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_risk_thresholds: {
        Row: {
          auto_alert_email: boolean
          automation_killed: boolean
          delta_imbalance_threshold_pct: number
          max_portfolio_drawdown_pct: number
          max_single_event_exposure_usd: number
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          auto_alert_email?: boolean
          automation_killed?: boolean
          delta_imbalance_threshold_pct?: number
          max_portfolio_drawdown_pct?: number
          max_single_event_exposure_usd?: number
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          auto_alert_email?: boolean
          automation_killed?: boolean
          delta_imbalance_threshold_pct?: number
          max_portfolio_drawdown_pct?: number
          max_single_event_exposure_usd?: number
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      vault_followers: {
        Row: {
          available_margin_usd: number
          created_at: string
          fee_tier: string
          id: string
          is_paused: boolean
          label: string
          max_contracts_per_market: number
          user_id: string
          vault_id: string
          venue: Database["public"]["Enums"]["venue"]
          venue_account_id: string | null
        }
        Insert: {
          available_margin_usd?: number
          created_at?: string
          fee_tier?: string
          id?: string
          is_paused?: boolean
          label: string
          max_contracts_per_market?: number
          user_id: string
          vault_id: string
          venue: Database["public"]["Enums"]["venue"]
          venue_account_id?: string | null
        }
        Update: {
          available_margin_usd?: number
          created_at?: string
          fee_tier?: string
          id?: string
          is_paused?: boolean
          label?: string
          max_contracts_per_market?: number
          user_id?: string
          vault_id?: string
          venue?: Database["public"]["Enums"]["venue"]
          venue_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_followers_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "copy_trading_vaults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_followers_venue_account_id_fkey"
            columns: ["venue_account_id"]
            isOneToOne: false
            referencedRelation: "venue_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_accounts: {
        Row: {
          created_at: string
          id: string
          identifier: string
          last_error: string | null
          last_synced_at: string | null
          status: string
          user_id: string
          venue: Database["public"]["Enums"]["venue"]
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          last_error?: string | null
          last_synced_at?: string | null
          status?: string
          user_id: string
          venue: Database["public"]["Enums"]["venue"]
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          last_error?: string | null
          last_synced_at?: string | null
          status?: string
          user_id?: string
          venue?: Database["public"]["Enums"]["venue"]
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          event_trigger: Database["public"]["Enums"]["webhook_trigger"]
          id: string
          idempotency_key: string
          is_test: boolean
          latency_ms: number | null
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          status: string
          updated_at: string
          user_id: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_trigger: Database["public"]["Enums"]["webhook_trigger"]
          id?: string
          idempotency_key: string
          is_test?: boolean
          latency_ms?: number | null
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
          updated_at?: string
          user_id: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_trigger?: Database["public"]["Enums"]["webhook_trigger"]
          id?: string
          idempotency_key?: string
          is_test?: boolean
          latency_ms?: number | null
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "execution_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_secrets: {
        Row: {
          secret: string
          webhook_id: string
        }
        Insert: {
          secret: string
          webhook_id: string
        }
        Update: {
          secret?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_secrets_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: true
            referencedRelation: "execution_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_org_invite: { Args: { _invite: string }; Returns: string }
      check_cron_token: { Args: { t: string }; Returns: boolean }
      create_organization: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      get_leaderboard: {
        Args: never
        Returns: {
          display_name: string
          handle: string
          sharpe_ratio: number
          total_roi_pct: number
          total_volume_usd: number
          verified_at: string
          win_rate_pct: number
        }[]
      }
      get_public_profile: {
        Args: { _handle: string }
        Returns: {
          display_name: string
          handle: string
          hide_absolute_values: boolean
          holdings: Json
          net_pnl_usd: number
          proof_payload: string
          proof_signature: string
          public_jwk: Json
          sharpe_ratio: number
          total_roi_pct: number
          total_volume_usd: number
          verified_at: string
          win_rate_pct: number
        }[]
      }
      is_org_admin: { Args: { _org: string; _user: string }; Returns: boolean }
      org_role_of: {
        Args: { _org: string; _user: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
    }
    Enums: {
      execution_event_type:
        | "sync"
        | "alert_triggered"
        | "export"
        | "rebalance_recommendation"
      market_category:
        | "Politics"
        | "Macro / Economics"
        | "Tech / AI"
        | "Pop Culture"
      org_role: "owner" | "admin" | "trader" | "view_only"
      plan_tier: "pro" | "syndicate" | "enterprise"
      venue: "Polymarket" | "Kalshi"
      webhook_trigger:
        | "arb_found"
        | "delta_breach"
        | "stop_loss_hit"
        | "settlement_imminent"
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
    Enums: {
      execution_event_type: [
        "sync",
        "alert_triggered",
        "export",
        "rebalance_recommendation",
      ],
      market_category: [
        "Politics",
        "Macro / Economics",
        "Tech / AI",
        "Pop Culture",
      ],
      org_role: ["owner", "admin", "trader", "view_only"],
      plan_tier: ["pro", "syndicate", "enterprise"],
      venue: ["Polymarket", "Kalshi"],
      webhook_trigger: [
        "arb_found",
        "delta_breach",
        "stop_loss_hit",
        "settlement_imminent",
      ],
    },
  },
} as const
