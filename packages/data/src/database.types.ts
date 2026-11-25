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
      unit: {
        Row: {
          category: string | null
          code: string
          group: string | null
          hsk_level: number
          order_idx: number
          patterns: string[]
          title: string
        }
        Insert: {
          category?: string | null
          code: string
          group?: string | null
          hsk_level: number
          order_idx: number
          patterns?: string[]
          title: string
        }
        Update: {
          category?: string | null
          code?: string
          group?: string | null
          hsk_level?: number
          order_idx?: number
          patterns?: string[]
          title?: string
        }
        Relationships: []
      }
      unit_word: {
        Row: {
          code: string
          hsk_level: number
          word_id: number
        }
        Insert: {
          code: string
          hsk_level: number
          word_id: number
        }
        Update: {
          code?: string
          hsk_level?: number
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "unit_word_unit_fkey"
            columns: ["hsk_level", "code"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["hsk_level", "code"]
          },
          {
            foreignKeyName: "unit_word_word_id_fkey"
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
          target_word_id: number | null
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
          target_word_id?: number | null
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
          target_word_id?: number | null
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
      reading: {
        Row: {
          audio_kind: string
          created_at: string
          format: string
          hsk_level: number
          questions: Json
          sentence_audio: Json
          sentences: Json
          series: string | null
          series_index: number | null
          slug: string
          target_grammar: Json
          target_words: string[]
          title: string
          topic: string
        }
        Insert: {
          audio_kind?: string
          created_at?: string
          format: string
          hsk_level: number
          questions?: Json
          sentence_audio?: Json
          sentences: Json
          series?: string | null
          series_index?: number | null
          slug: string
          target_grammar?: Json
          target_words?: string[]
          title: string
          topic: string
        }
        Update: {
          audio_kind?: string
          created_at?: string
          format?: string
          hsk_level?: number
          questions?: Json
          sentence_audio?: Json
          sentences?: Json
          series?: string | null
          series_index?: number | null
          slug?: string
          target_grammar?: Json
          target_words?: string[]
          title?: string
          topic?: string
        }
        Relationships: []
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
          handwriting: boolean
          hanzi: string
          hsk_level: number
        }
        Insert: {
          handwriting?: boolean
          hanzi: string
          hsk_level: number
        }
        Update: {
          handwriting?: boolean
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
          elapsed_days: number
          fsrs_state: string
          id: string
          lapses: number
          last_reviewed_at: string | null
          learning_steps: number
          leech: boolean
          leech_cleared_lapses: number
          next_review_at: string | null
          reps: number
          scheduled_days: number
          skill: string
          stability: number | null
          suspended: boolean
          auto_suspended: boolean
          target_id: number
          target_kind: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          elapsed_days?: number
          fsrs_state?: string
          id?: string
          lapses?: number
          last_reviewed_at?: string | null
          learning_steps?: number
          leech?: boolean
          leech_cleared_lapses?: number
          next_review_at?: string | null
          reps?: number
          scheduled_days?: number
          skill: string
          stability?: number | null
          suspended?: boolean
          auto_suspended?: boolean
          target_id: number
          target_kind: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          elapsed_days?: number
          fsrs_state?: string
          id?: string
          lapses?: number
          last_reviewed_at?: string | null
          learning_steps?: number
          leech?: boolean
          leech_cleared_lapses?: number
          next_review_at?: string | null
          reps?: number
          scheduled_days?: number
          skill?: string
          stability?: number | null
          suspended?: boolean
          auto_suspended?: boolean
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
      word_context: {
        Row: {
          created_at: string
          id: string
          sentence: string
          source_id: string | null
          source_kind: string
          user_id: string
          word_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          sentence: string
          source_id?: string | null
          source_kind: string
          user_id: string
          word_id: number
        }
        Update: {
          created_at?: string
          id?: string
          sentence?: string
          source_id?: string | null
          source_kind?: string
          user_id?: string
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "word_context_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "word_context_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      grammar_points: {
        Row: {
          category: string | null
          code: string | null
          common_errors: Json
          created_at: string
          detail: string | null
          examples: Json
          explanation: string | null
          group: string | null
          hsk_level: number
          id: number
          items: string[] | null
          markers: string[]
          order_idx: number | null
          pattern: string | null
          see_also: Json
          title: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          common_errors?: Json
          created_at?: string
          detail?: string | null
          examples?: Json
          explanation?: string | null
          group?: string | null
          hsk_level: number
          id?: number
          items?: string[] | null
          markers?: string[]
          order_idx?: number | null
          pattern?: string | null
          see_also?: Json
          title: string
        }
        Update: {
          category?: string | null
          code?: string | null
          common_errors?: Json
          created_at?: string
          detail?: string | null
          examples?: Json
          explanation?: string | null
          group?: string | null
          hsk_level?: number
          id?: number
          items?: string[] | null
          markers?: string[]
          order_idx?: number | null
          pattern?: string | null
          see_also?: Json
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
          reading_id: string | null
          reading_slug: string | null
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          reading_id?: string | null
          reading_slug?: string | null
          score: number
          total: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          reading_id?: string | null
          reading_slug?: string | null
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
          grade: number | null
          id: string
          prior_snapshot: Json | null
          quality: number | null
          result_snapshot: Json | null
          reverted_at: string | null
          reviewed_at: string
          time_ms: number | null
          user_id: string
        }
        Insert: {
          card_id: string
          client_review_id?: string | null
          client_reviewed_at?: string | null
          grade?: number | null
          id?: string
          prior_snapshot?: Json | null
          quality?: number | null
          result_snapshot?: Json | null
          reverted_at?: string | null
          reviewed_at?: string
          time_ms?: number | null
          user_id: string
        }
        Update: {
          card_id?: string
          client_review_id?: string | null
          client_reviewed_at?: string | null
          grade?: number | null
          id?: string
          prior_snapshot?: Json | null
          quality?: number | null
          result_snapshot?: Json | null
          reverted_at?: string | null
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
          id: string
          updated_at: string
          user_id: string
          version: number
          word_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          version?: number
          word_id: number
        }
        Update: {
          created_at?: string
          id?: string
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
          card_order: string
          created_at: string
          current_level: number
          exam_date: string | null
          new_cards_per_day: number
          review_limit_per_day: number
          request_retention: number
          session_size: number
          support_language: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_order?: string
          created_at?: string
          current_level?: number
          exam_date?: string | null
          new_cards_per_day?: number
          review_limit_per_day?: number
          request_retention?: number
          session_size?: number
          support_language?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_order?: string
          created_at?: string
          current_level?: number
          exam_date?: string | null
          new_cards_per_day?: number
          review_limit_per_day?: number
          request_retention?: number
          session_size?: number
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
      active_unit: {
        Args: {
          p_stability_days?: number
        }
        Returns: {
          hsk_level: number
          code: string
          title: string
          total_words: number
          settled_words: number
          word_count: number
          pattern_count: number
          grammar_id: number | null
          total_items: number
          settled_items: number
        }[]
      }
      build_exercise_session: {
        Args: {
          p_length?: number
          p_target_word_ids?: number[] | null
          p_unit_code?: string | null
        }
        Returns: Json
      }
      build_mock_exam: {
        Args: {
          p_level: number
          p_scope?: string
          p_section_code?: string | null
        }
        Returns: Json
      }
      add_deck_from_template: {
        Args: {
          p_template_id: string
        }
        Returns: {
          deck_id: string
          inserted: number
        }[]
      }
      apply_review: {
        Args: {
          p_card_id: string
          p_expected_version: number
          p_grade: number
          p_prior: Json
          p_review_id: string
          p_reviewed_at: string
          p_skill: string
          p_state: Json
          p_time_ms?: number | null
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      count_deck_cards: {
        Args: {
          p_deck_id?: string | null
          p_due_only?: boolean
        }
        Returns: {
          count: number
          deck_id: string | null
        }[]
      }
      count_due_cards_by_state: {
        Args: {
          p_deck_id?: string | null
          p_skill?: string
        }
        Returns: {
          regular_due_count: number
          relearning_count: number
        }[]
      }
      mistake_queue: {
        Args: {
          p_limit?: number
        }
        Returns: {
          target_id: number
          hanzi: string
          pinyin: string
          meaning_es: string | null
          meaning_en: string
          misses: number
          hits_since: number
          distinct_days: number
        }[]
      }
      build_review_queue: {
        Args: {
          p_deck_id?: string | null
          p_limit?: number | null
          p_skill?: string
        }
        Returns: {
          card_id: string
          user_id: string
          word_id: number
          skill: string
          is_new: boolean
          difficulty: number | null
          stability: number | null
          reps: number
          lapses: number
          learning_steps: number
          scheduled_days: number
          elapsed_days: number
          fsrs_state: string
          next_review_at: string | null
          last_reviewed_at: string | null
          version: number
        }[]
      }
      build_review_queue_mode: {
        Args: {
          p_deck_id?: string | null
          p_limit?: number | null
          p_mode: string
          p_skill?: string
        }
        Returns: {
          card_id: string
          user_id: string
          word_id: number
          skill: string
          is_new: boolean
          difficulty: number | null
          stability: number | null
          reps: number
          lapses: number
          learning_steps: number
          scheduled_days: number
          elapsed_days: number
          fsrs_state: string
          next_review_at: string | null
          last_reviewed_at: string | null
          version: number
        }[]
      }
      mark_grammar_studied: {
        Args: {
          p_grammar_id: number
        }
        Returns: undefined
      }
      unit_completion_stability_days: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      create_study_plan: {
        Args: {
          p_levels?: number[]
        }
        Returns: {
          deck_id: string
          scope_size: number
        }[]
      }
      clear_leech: {
        Args: {
          p_skill: string
          p_target_id: number
          p_target_kind: string
        }
        Returns: unknown
      }
      get_dashboard: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_deck_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          deck_id: string
          due_count: number
          word_count: number
        }[]
      }
      submit_diagnostic: {
        Args: {
          p_results: Json
        }
        Returns: {
          suspended: number
          queued: number
        }[]
      }
      initialize_reading_skill_state: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      initialize_word_skill_states: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      leech_lapses_threshold: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      log_study_time: {
        Args: {
          p_ms: number
        }
        Returns: {
          time_spent_ms: number
        }[]
      }
      revert_review: {
        Args: {
          p_review_id: string
        }
        Returns: {
          card_id: string | null
          outcome: string
          version: number | null
        }[]
      }
      unlock_derived_skills: {
        Args: {
          p_min_stability?: number
        }
        Returns: number
      }
      ensure_today_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
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
