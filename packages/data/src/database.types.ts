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
      deck_cards: {
        Row: {
          created_at: string
          deck_id: string
          word_id: number
        }
        Insert: {
          created_at?: string
          deck_id: string
          word_id: number
        }
        Update: {
          created_at?: string
          deck_id?: string
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          hsk_level: number | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          hsk_level?: number | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          hsk_level?: number | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      deck_template_words: {
        Row: {
          sort_order: number
          template_id: string
          word_id: number
        }
        Insert: {
          sort_order?: number
          template_id: string
          word_id: number
        }
        Update: {
          sort_order?: number
          template_id?: string
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_template_words_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "deck_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_template_words_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          source_template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          source_template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          source_template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "deck_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      hsk_characters: {
        Row: {
          hanzi: string
          hsk_level: number
        }
        Insert: {
          hanzi: string
          hsk_level: number
        }
        Update: {
          hanzi?: string
          hsk_level?: number
        }
        Relationships: []
      }
      content_item: {
        Row: {
          created_at: string
          hsk_level: number
          id: string
          kind: string
          source_id: string | null
          source_table: string | null
          title: string
        }
        Insert: {
          created_at?: string
          hsk_level: number
          id?: string
          kind: string
          source_id?: string | null
          source_table?: string | null
          title: string
        }
        Update: {
          created_at?: string
          hsk_level?: number
          id?: string
          kind?: string
          source_id?: string | null
          source_table?: string | null
          title?: string
        }
        Relationships: []
      }
      content_teaches: {
        Row: {
          content_id: string
          role: string
          target_id: number
          target_kind: string
        }
        Insert: {
          content_id: string
          role?: string
          target_id: number
          target_kind: string
        }
        Update: {
          content_id?: string
          role?: string
          target_id?: number
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_teaches_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_event: {
        Row: {
          client_event_id: string | null
          id: string
          kind: string
          occurred_at: string
          payload: Json
          recorded_at: string
          reverts_event_id: string | null
          skill: string | null
          target_id: number | null
          target_kind: string | null
          user_id: string
        }
        Insert: {
          client_event_id?: string | null
          id?: string
          kind: string
          occurred_at?: string
          payload?: Json
          recorded_at?: string
          reverts_event_id?: string | null
          skill?: string | null
          target_id?: number | null
          target_kind?: string | null
          user_id: string
        }
        Update: {
          client_event_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          payload?: Json
          recorded_at?: string
          reverts_event_id?: string | null
          skill?: string | null
          target_id?: number | null
          target_kind?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_event_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_event_reverts_event_id_fkey"
            columns: ["reverts_event_id"]
            isOneToOne: false
            referencedRelation: "learning_event"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_template: {
        Row: {
          description: string
          skill: string
          type: string
        }
        Insert: {
          description: string
          skill: string
          type: string
        }
        Update: {
          description?: string
          skill?: string
          type?: string
        }
        Relationships: []
      }
      learner_skill_state: {
        Row: {
          created_at: string
          difficulty: number | null
          id: string
          lapses: number
          last_reviewed_at: string | null
          next_review_at: string | null
          reps: number
          retrievability: number | null
          skill: string
          stability: number | null
          suspended: boolean
          target_id: number
          target_kind: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          id?: string
          lapses?: number
          last_reviewed_at?: string | null
          next_review_at?: string | null
          reps?: number
          retrievability?: number | null
          skill: string
          stability?: number | null
          suspended?: boolean
          target_id: number
          target_kind: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          id?: string
          lapses?: number
          last_reviewed_at?: string | null
          next_review_at?: string | null
          reps?: number
          retrievability?: number | null
          skill?: string
          stability?: number | null
          suspended?: boolean
          target_id?: number
          target_kind?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learner_skill_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grammar_points: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          detail: string | null
          examples: Json
          explanation: string | null
          group: string | null
          hsk_level: number
          id: number
          items: string[] | null
          order_idx: number | null
          pattern: string | null
          title: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          detail?: string | null
          examples?: Json
          explanation?: string | null
          group?: string | null
          hsk_level: number
          id?: number
          items?: string[] | null
          order_idx?: number | null
          pattern?: string | null
          title: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          detail?: string | null
          examples?: Json
          explanation?: string | null
          group?: string | null
          hsk_level?: number
          id?: number
          items?: string[] | null
          order_idx?: number | null
          pattern?: string | null
          title?: string
        }
        Relationships: []
      }
      grammar_prerequisite: {
        Row: {
          code: string
          hsk_level: number
          requires_code: string
          requires_level: number
        }
        Insert: {
          code: string
          hsk_level: number
          requires_code: string
          requires_level: number
        }
        Update: {
          code?: string
          hsk_level?: number
          requires_code?: string
          requires_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "grammar_prerequisite_current_fkey"
            columns: ["hsk_level", "code"]
            isOneToOne: false
            referencedRelation: "grammar_points"
            referencedColumns: ["hsk_level", "code"]
          },
          {
            foreignKeyName: "grammar_prerequisite_required_fkey"
            columns: ["requires_level", "requires_code"]
            isOneToOne: false
            referencedRelation: "grammar_points"
            referencedColumns: ["hsk_level", "code"]
          },
        ]
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
          support_language: string
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
          support_language?: string
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
          support_language?: string
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
          classifier: string | null
          frequency: number | null
          hanzi: string
          hsk_level: number
          id: number
          meaning_en: string
          meaning_es: string | null
          pinyin_normalized: string | null
          pinyin: string
          pos: string | null
          sense_index: number | null
          traditional: string | null
          variants: string[] | null
        }
        Insert: {
          classifier?: string | null
          frequency?: number | null
          hanzi: string
          hsk_level: number
          id?: number
          meaning_en: string
          meaning_es?: string | null
          pinyin_normalized?: string | null
          pinyin: string
          pos?: string | null
          sense_index?: number | null
          traditional?: string | null
          variants?: string[] | null
        }
        Update: {
          classifier?: string | null
          frequency?: number | null
          hanzi?: string
          hsk_level?: number
          id?: number
          meaning_en?: string
          meaning_es?: string | null
          pinyin_normalized?: string | null
          pinyin?: string
          pos?: string | null
          sense_index?: number | null
          traditional?: string | null
          variants?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      review_flashcard: {
        Args: {
          card_id: string
          expected_version: number
          quality: number
          review_id: string
          reviewed_at: string
          time_ms: number | null
        }
        Returns: {
          ease_factor: number
          interval: number
          last_reviewed_at: string | null
          next_review: string
          outcome: string
          repetitions: number
          status: string
          version: number
        }[]
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
