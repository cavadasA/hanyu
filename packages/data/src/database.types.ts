export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      exercise_attempts: {
        Row: {
          created_at: string
          exercise_id: string | null
          feedback: Json | null
          id: string
          is_correct: boolean
          submitted_answer: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          feedback?: Json | null
          id?: string
          is_correct: boolean
          submitted_answer: Json
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          feedback?: Json | null
          id?: string
          is_correct?: boolean
          submitted_answer?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "generated_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_exercises: {
        Row: {
          answer: Json
          created_at: string
          created_by: string | null
          hsk_level: number
          id: string
          prompt: Json
          source_model: string | null
          type: string
        }
        Insert: {
          answer: Json
          created_at?: string
          created_by?: string | null
          hsk_level: number
          id?: string
          prompt: Json
          source_model?: string | null
          type: string
        }
        Update: {
          answer?: Json
          created_at?: string
          created_by?: string | null
          hsk_level?: number
          id?: string
          prompt?: Json
          source_model?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_exercises_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_readings: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          format: string
          hsk_level: number
          id: string
          pinyin_text: string | null
          questions: Json
          source_model: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          format: string
          hsk_level: number
          id?: string
          pinyin_text?: string | null
          questions?: Json
          source_model?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          format?: string
          hsk_level?: number
          id?: string
          pinyin_text?: string | null
          questions?: Json
          source_model?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grammar_points: {
        Row: {
          created_at: string
          examples: Json
          explanation: string
          hsk_level: number
          id: number
          order_idx: number | null
          title: string
        }
        Insert: {
          created_at?: string
          examples?: Json
          explanation: string
          hsk_level: number
          id?: number
          order_idx?: number | null
          title: string
        }
        Update: {
          created_at?: string
          examples?: Json
          explanation?: string
          hsk_level?: number
          id?: number
          order_idx?: number | null
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reading_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          reading_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          reading_id: string
          score: number
          total: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          reading_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_attempts_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "generated_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_log: {
        Row: {
          card_id: string
          client_review_id: string | null
          client_reviewed_at: string | null
          id: string
          quality: number
          result_snapshot: Json | null
          reviewed_at: string
          time_ms: number | null
          user_id: string
        }
        Insert: {
          card_id: string
          client_review_id?: string | null
          client_reviewed_at?: string | null
          id?: string
          quality: number
          result_snapshot?: Json | null
          reviewed_at?: string
          time_ms?: number | null
          user_id: string
        }
        Update: {
          card_id?: string
          client_review_id?: string | null
          client_reviewed_at?: string | null
          id?: string
          quality?: number
          result_snapshot?: Json | null
          reviewed_at?: string
          time_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "srs_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      srs_cards: {
        Row: {
          created_at: string
          ease_factor: number
          id: string
          interval_days: number
          last_reviewed_at: string | null
          next_review_at: string
          repetitions: number
          status: string
          updated_at: string
          user_id: string
          version: number
          word_id: number
        }
        Insert: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          status?: string
          updated_at?: string
          user_id: string
          version?: number
          word_id: number
        }
        Update: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "srs_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srs_cards_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          ai_provider: string
          card_order: string
          cards_per_day: number
          created_at: string
          current_level: number
          max_reviews_per_session: number
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_provider?: string
          card_order?: string
          cards_per_day?: number
          created_at?: string
          current_level?: number
          max_reviews_per_session?: number
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_provider?: string
          card_order?: string
          cards_per_day?: number
          created_at?: string
          current_level?: number
          max_reviews_per_session?: number
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stats: {
        Row: {
          cards_new: number
          cards_reviewed: number
          created_at: string
          date: string
          exercises_done: number
          id: string
          readings_done: number
          time_spent_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cards_new?: number
          cards_reviewed?: number
          created_at?: string
          date: string
          exercises_done?: number
          id?: string
          readings_done?: number
          time_spent_ms?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cards_new?: number
          cards_reviewed?: number
          created_at?: string
          date?: string
          exercises_done?: number
          id?: string
          readings_done?: number
          time_spent_ms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      words: {
        Row: {
          frequency: number | null
          hanzi: string
          hsk_level: number
          id: number
          meaning_en: string
          meaning_es: string | null
          pinyin: string
          pos: string | null
        }
        Insert: {
          frequency?: number | null
          hanzi: string
          hsk_level: number
          id?: number
          meaning_en: string
          meaning_es?: string | null
          pinyin: string
          pos?: string | null
        }
        Update: {
          frequency?: number | null
          hanzi?: string
          hsk_level?: number
          id?: number
          meaning_en?: string
          meaning_es?: string | null
          pinyin?: string
          pos?: string | null
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
