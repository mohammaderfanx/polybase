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
          delta_imbalance_threshold_pct: number
          max_portfolio_drawdown_pct: number
          max_single_event_exposure_usd: number
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          auto_alert_email?: boolean
          delta_imbalance_threshold_pct?: number
          max_portfolio_drawdown_pct?: number
          max_single_event_exposure_usd?: number
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          auto_alert_email?: boolean
          delta_imbalance_threshold_pct?: number
          max_portfolio_drawdown_pct?: number
          max_single_event_exposure_usd?: number
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
      venue: "Polymarket" | "Kalshi"
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
      venue: ["Polymarket", "Kalshi"],
    },
  },
} as const
