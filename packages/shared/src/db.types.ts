
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_step_ups": {
                  Row: {
                    "expires_at": string | null,"member_id": string,"session_id": string,"source": string,"trusted_device_id": string | null,"verified_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string | null,"member_id": string,"session_id": string,"source": string,"trusted_device_id"?: string | null,"verified_at"?: string
                  }
                  Update: {
                    "expires_at"?: string | null,"member_id"?: string,"session_id"?: string,"source"?: string,"trusted_device_id"?: string | null,"verified_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_step_ups_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_step_ups_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_step_ups_trusted_device_id_fkey"
      columns: ["trusted_device_id"]
isOneToOne: false
      referencedRelation: "admin_trusted_devices"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_trusted_devices": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"label": string | null,"last_used_at": string | null,"member_id": string,"revoked_at": string | null,"secret_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"last_used_at"?: string | null,"member_id": string,"revoked_at"?: string | null,"secret_hash": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"last_used_at"?: string | null,"member_id"?: string,"revoked_at"?: string | null,"secret_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_trusted_devices_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_trusted_devices_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "audience": Database["public"]['Enums']["audience"],"author_member_id": string,"body": string,"branch_id": string | null,"created_at": string,"hidden_at": string | null,"id": string,"image_path": string | null,"pinned": boolean,"published_at": string | null,"removed_at": string | null,"removed_by": string | null,"scope": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: Database["public"]['Enums']["audience"],"author_member_id"?: string,"body": string,"branch_id"?: string | null,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"image_path"?: string | null,"pinned"?: boolean,"published_at"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"scope": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["audience"],"author_member_id"?: string,"body"?: string,"branch_id"?: string | null,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"image_path"?: string | null,"pinned"?: boolean,"published_at"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"scope"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_author_member_id_fkey"
      columns: ["author_member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_author_member_id_fkey"
      columns: ["author_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "description": string | null,"is_public": boolean,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"is_public"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"is_public"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_member_id": string | null,"actor_user_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_member_id"?: string | null,"actor_user_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_member_id"?: string | null,"actor_user_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"branch_transfers": {
                  Row: {
                    "decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"from_branch_id": string,"id": string,"member_id": string,"reason": string | null,"request_note": string | null,"requested_at": string,"requested_by": string | null,"status": string,"to_branch_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"from_branch_id": string,"id"?: string,"member_id": string,"reason"?: string | null,"request_note"?: string | null,"requested_at"?: string,"requested_by"?: string | null,"status"?: string,"to_branch_id": string
                  }
                  Update: {
                    "decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"from_branch_id"?: string,"id"?: string,"member_id"?: string,"reason"?: string | null,"request_note"?: string | null,"requested_at"?: string,"requested_by"?: string | null,"status"?: string,"to_branch_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branch_transfers_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_from_branch_id_fkey"
      columns: ["from_branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_transfers_to_branch_id_fkey"
      columns: ["to_branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"check_ins": {
                  Row: {
                    "checked_in_at": string,"checked_in_by": string | null,"client_ref": string,"event_id": string,"member_id": string,"source": string,"walk_in": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_in_at"?: string,"checked_in_by"?: string | null,"client_ref": string,"event_id": string,"member_id": string,"source"?: string,"walk_in"?: boolean
                  }
                  Update: {
                    "checked_in_at"?: string,"checked_in_by"?: string | null,"client_ref"?: string,"event_id"?: string,"member_id"?: string,"source"?: string,"walk_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_ins_checked_in_by_fkey"
      columns: ["checked_in_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_checked_in_by_fkey"
      columns: ["checked_in_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"claim_attempts": {
                  Row: {
                    "attempted_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempted_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"consent_records": {
                  Row: {
                    "attested_at": string,"attested_by": string | null,"document_path": string | null,"guardian_alerts": boolean,"guardian_name": string | null,"guardian_phone": string | null,"id": string,"member_id": string,"method": Database["public"]['Enums']["consent_method"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attested_at"?: string,"attested_by"?: string | null,"document_path"?: string | null,"guardian_alerts"?: boolean,"guardian_name"?: string | null,"guardian_phone"?: string | null,"id"?: string,"member_id": string,"method": Database["public"]['Enums']["consent_method"]
                  }
                  Update: {
                    "attested_at"?: string,"attested_by"?: string | null,"document_path"?: string | null,"guardian_alerts"?: boolean,"guardian_name"?: string | null,"guardian_phone"?: string | null,"id"?: string,"member_id"?: string,"method"?: Database["public"]['Enums']["consent_method"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_records_attested_by_fkey"
      columns: ["attested_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_attested_by_fkey"
      columns: ["attested_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"dependent_claims": {
                  Row: {
                    "code_hash": string,"created_at": string,"dependent_id": string,"expires_at": string,"id": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"dependent_id": string,"expires_at": string,"id"?: string,"used_at"?: string | null
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"dependent_id"?: string,"expires_at"?: string,"id"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dependent_claims_dependent_id_fkey"
      columns: ["dependent_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dependent_claims_dependent_id_fkey"
      columns: ["dependent_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"email_verifications": {
                  Row: {
                    "attempts": number,"code_hash": string,"created_at": string,"email": string,"expires_at": string,"id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"code_hash": string,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"member_id": string
                  }
                  Update: {
                    "attempts"?: number,"code_hash"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_verifications_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_verifications_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"event_staff": {
                  Row: {
                    "added_by": string | null,"capabilities": (string)[],"created_at": string,"event_id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"capabilities": (string)[],"created_at"?: string,"event_id": string,"member_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"capabilities"?: (string)[],"created_at"?: string,"event_id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_staff_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_staff_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_staff_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_staff_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_staff_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "audience": Database["public"]['Enums']["audience"],"branch_id": string | null,"capacity": number | null,"cover_path": string | null,"created_at": string,"created_by": string,"description": string | null,"ends_at": string,"hidden_at": string | null,"id": string,"map_url": string | null,"registration_closes_at": string | null,"registration_opens_at": string | null,"removed_at": string | null,"removed_by": string | null,"scope": string,"starts_at": string,"status": string,"title": string,"updated_at": string,"venue_address": string | null,"venue_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: Database["public"]['Enums']["audience"],"branch_id"?: string | null,"capacity"?: number | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"ends_at": string,"hidden_at"?: string | null,"id"?: string,"map_url"?: string | null,"registration_closes_at"?: string | null,"registration_opens_at"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"scope": string,"starts_at": string,"status"?: string,"title": string,"updated_at"?: string,"venue_address"?: string | null,"venue_name"?: string | null
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["audience"],"branch_id"?: string | null,"capacity"?: number | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"ends_at"?: string,"hidden_at"?: string | null,"id"?: string,"map_url"?: string | null,"registration_closes_at"?: string | null,"registration_opens_at"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"scope"?: string,"starts_at"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"venue_address"?: string | null,"venue_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"member_guardians": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"ended_reason": string | null,"guardian_member_id": string,"member_id": string,"relationship": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"ended_reason"?: string | null,"guardian_member_id": string,"member_id": string,"relationship": string
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"ended_reason"?: string | null,"guardian_member_id"?: string,"member_id"?: string,"relationship"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_guardians_guardian_member_id_fkey"
      columns: ["guardian_member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_guardians_guardian_member_id_fkey"
      columns: ["guardian_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_guardians_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_guardians_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"member_private": {
                  Row: {
                    "dob": string,"email": string | null,"email_verified_at": string | null,"emergency_contact_name": string | null,"emergency_contact_phone": string | null,"member_id": string,"notify_prefs": NonNullable<Json>,"phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "dob": string,"email"?: string | null,"email_verified_at"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"member_id": string,"notify_prefs"?: NonNullable<Json>,"phone"?: string | null
                  }
                  Update: {
                    "dob"?: string,"email"?: string | null,"email_verified_at"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"member_id"?: string,"notify_prefs"?: NonNullable<Json>,"phone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_private_member_id_fkey"
      columns: ["member_id"]
isOneToOne: true
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_private_member_id_fkey"
      columns: ["member_id"]
isOneToOne: true
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"member_status_events": {
                  Row: {
                    "changed_by": string | null,"created_at": string,"from_status": Database["public"]['Enums']["member_status"] | null,"id": string,"member_id": string,"reason": string | null,"to_status": Database["public"]['Enums']["member_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_by"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["member_status"] | null,"id"?: string,"member_id": string,"reason"?: string | null,"to_status": Database["public"]['Enums']["member_status"]
                  }
                  Update: {
                    "changed_by"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["member_status"] | null,"id"?: string,"member_id"?: string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["member_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_status_events_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_status_events_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_status_events_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_status_events_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "adult_consent_at": string | null,"adult_consent_required": boolean,"approved_at": string | null,"approved_by": string | null,"bio": string | null,"branch_id": string,"city": string | null,"created_at": string,"education": string | null,"full_name": string,"gender": string | null,"id": string,"member_no": string | null,"occupation": string | null,"pass_version": number,"photo_path": string | null,"privacy": NonNullable<Json>,"status": Database["public"]['Enums']["member_status"],"status_changed_at": string,"status_reason": string | null,"updated_at": string,"user_id": string | null,"wing": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adult_consent_at"?: string | null,"adult_consent_required"?: boolean,"approved_at"?: string | null,"approved_by"?: string | null,"bio"?: string | null,"branch_id": string,"city"?: string | null,"created_at"?: string,"education"?: string | null,"full_name": string,"gender"?: string | null,"id"?: string,"member_no"?: string | null,"occupation"?: string | null,"pass_version"?: number,"photo_path"?: string | null,"privacy"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["member_status"],"status_changed_at"?: string,"status_reason"?: string | null,"updated_at"?: string,"user_id"?: string | null,"wing"?: string
                  }
                  Update: {
                    "adult_consent_at"?: string | null,"adult_consent_required"?: boolean,"approved_at"?: string | null,"approved_by"?: string | null,"bio"?: string | null,"branch_id"?: string,"city"?: string | null,"created_at"?: string,"education"?: string | null,"full_name"?: string,"gender"?: string | null,"id"?: string,"member_no"?: string | null,"occupation"?: string | null,"pass_version"?: number,"photo_path"?: string | null,"privacy"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["member_status"],"status_changed_at"?: string,"status_reason"?: string | null,"updated_at"?: string,"user_id"?: string | null,"wing"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_deliveries": {
                  Row: {
                    "attempts": number,"channel": string,"last_error": string | null,"notification_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": string,"last_error"?: string | null,"notification_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: string,"last_error"?: string | null,"notification_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_deliveries_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"kind": string,"member_id": string,"priority": string,"read_at": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind": string,"member_id": string,"priority"?: string,"read_at"?: string | null,"title": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"member_id"?: string,"priority"?: string,"read_at"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"otp_throttle": {
                  Row: {
                    "phone_hash": string,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "phone_hash": string,"sent_at"?: string
                  }
                  Update: {
                    "phone_hash"?: string,"sent_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"permissions": {
                  Row: {
                    "description": string | null,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string
                  }
                  Update: {
                    "description"?: string | null,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"id": string,"last_seen_at": string,"member_id": string,"platform": string,"subscription": Json | null,"token": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string,"member_id"?: string,"platform": string,"subscription"?: Json | null,"token"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string,"member_id"?: string,"platform"?: string,"subscription"?: Json | null,"token"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_tokens_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "assigned_to": string | null,"created_at": string,"details": string | null,"id": string,"priority": string,"reason": string,"reporter_member_id": string,"resolution_note": string | null,"resolved_at": string | null,"status": string,"target_id": string,"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"created_at"?: string,"details"?: string | null,"id"?: string,"priority"?: string,"reason": string,"reporter_member_id": string,"resolution_note"?: string | null,"resolved_at"?: string | null,"status"?: string,"target_id": string,"target_type": string
                  }
                  Update: {
                    "assigned_to"?: string | null,"created_at"?: string,"details"?: string | null,"id"?: string,"priority"?: string,"reason"?: string,"reporter_member_id"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"status"?: string,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_member_id_fkey"
      columns: ["reporter_member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_member_id_fkey"
      columns: ["reporter_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"role_assignments": {
                  Row: {
                    "assigned_by": string | null,"branch_id": string | null,"created_at": string,"ends_on": string | null,"id": string,"member_id": string,"role_key": string,"starts_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_by"?: string | null,"branch_id"?: string | null,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"member_id": string,"role_key": string,"starts_on"?: string
                  }
                  Update: {
                    "assigned_by"?: string | null,"branch_id"?: string | null,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"member_id"?: string,"role_key"?: string,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_assignments_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_assignments_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_assignments_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_assignments_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role_key": string
                  }
                  Update: {
                    "permission_key"?: string,"role_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"roles": {
                  Row: {
                    "description": string | null,"key": string,"name": string,"scope": Database["public"]['Enums']["role_scope"]
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"name": string,"scope": Database["public"]['Enums']["role_scope"]
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"name"?: string,"scope"?: Database["public"]['Enums']["role_scope"]
                  }
                  Relationships: [
                    
                  ]
                },"roster_entries": {
                  Row: {
                    "branch_id": string,"claimed_at": string | null,"claimed_member_id": string | null,"dob": string | null,"full_name": string,"id": string,"imported_at": string,"imported_by": string | null,"member_no": string | null,"notes": string | null,"phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"claimed_at"?: string | null,"claimed_member_id"?: string | null,"dob"?: string | null,"full_name": string,"id"?: string,"imported_at"?: string,"imported_by"?: string | null,"member_no"?: string | null,"notes"?: string | null,"phone"?: string | null
                  }
                  Update: {
                    "branch_id"?: string,"claimed_at"?: string | null,"claimed_member_id"?: string | null,"dob"?: string | null,"full_name"?: string,"id"?: string,"imported_at"?: string,"imported_by"?: string | null,"member_no"?: string | null,"notes"?: string | null,"phone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_entries_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_claimed_member_id_fkey"
      columns: ["claimed_member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_claimed_member_id_fkey"
      columns: ["claimed_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_imported_by_fkey"
      columns: ["imported_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_imported_by_fkey"
      columns: ["imported_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"rsvps": {
                  Row: {
                    "created_at": string,"created_by": string | null,"event_id": string,"member_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"event_id": string,"member_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"event_id"?: string,"member_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rsvps_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvps_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvps_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvps_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvps_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "member_cards": {
                  Row: {
                    "branch_id": string,"city": string | null,"full_name": string,"id": string,"member_no": string | null,"occupation": string | null,"photo_path": string | null,"wing": string
                  }
                  ComputedFields: never
                  Insert: {
                           "branch_id"?: string | null,"city"?: never,"full_name"?: string | null,"id"?: string | null,"member_no"?: string | null,"occupation"?: never,"photo_path"?: never,"wing"?: string | null
                         }
                        Update: {
                           "branch_id"?: string | null,"city"?: never,"full_name"?: string | null,"id"?: string | null,"member_no"?: string | null,"occupation"?: never,"photo_path"?: never,"wing"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "members_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_dependent":
{ Args: { "payload": Json }; Returns: Json
                           },
"adult_handover_grace_days":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"age_years":
{ Args: { "d": string }; Returns: number
                           },
"approve_member":
{ Args: { "consent"?: Json,"member_id": string }; Returns: Json
                           },
"assign_role":
{ Args: { "branch_id"?: string,"ends_on"?: string,"member_id": string,"role_key": string,"starts_on"?: string }; Returns: Json
                           },
"block_member":
{ Args: { "member_id": string,"reason": string }; Returns: Json
                           },
"branch_officers":
{ Args: { "branch": string }; Returns: string[]
                           },
"can_manage_member":
{ Args: { "target": string }; Returns: boolean
                           },
"cancel_branch_transfer":
{ Args: { "id": string }; Returns: Json
                           },
"create_claim_code":
{ Args: { "dependent_id": string }; Returns: Json
                           },
"current_member_branch_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_member_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_member_wing":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"daily_age_transitions":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"decide_branch_transfer":
{ Args: { "approve": boolean,"id": string,"note"?: string }; Returns: Json
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"end_role":
{ Args: { "assignment_id": string,"ends_on"?: string }; Returns: Json
                           },
"event_pack":
{ Args: { "event_id": string }; Returns: {
              "age_group": string,"branch_name": string,"full_name": string,"guardian_names": (string)[],"member_id": string,"member_no": string,"pass_version": number,"photo_path": string
            }[]
                           },
"give_adult_consent":
{ Args: { "payload": Json }; Returns: Json
                           },
"graduate_dependent":
{ Args: { "code": string }; Returns: Json
                           },
"has_permission":
{ Args: { "branch"?: string,"perm": string }; Returns: boolean
                           },
"has_step_up":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"import_roster":
{ Args: { "rows": Json }; Returns: Json
                           },
"is_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_event_officer":
{ Args: { "event": string }; Returns: boolean
                           },
"is_event_staff":
{ Args: { "capability": string,"event": string }; Returns: boolean
                           },
"is_guardian_of":
{ Args: { "ward": string }; Returns: boolean
                           },
"is_listed_event_staff":
{ Args: { "caps": (string)[],"event": string }; Returns: boolean
                           },
"is_minor":
{ Args: { "member_id": string }; Returns: boolean
                           },
"my_dependents":
{ Args: Record<PropertyKey, never>; Returns: {
              "branch_id": string,"claim_code_expires_at": string,"dob": string,"full_name": string,"has_login": boolean,"member_id": string,"member_no": string,"relationship": string,"status": Database["public"]['Enums']["member_status"],"wing": string
            }[]
                           },
"my_permissions":
{ Args: Record<PropertyKey, never>; Returns: {
              "branch_id": string,"permission_key": string
            }[]
                           },
"my_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_reports":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"id": string,"resolved_at": string,"status": string,"target_id": string,"target_type": string
            }[]
                           },
"notify_member_or_guardians":
{ Args: { "data"?: Json,"guardian_body": string,"guardian_title": string,"kind": string,"priority": string,"self_body": string,"self_title": string,"target": string }; Returns: number
                           },
"publish_announcement":
{ Args: { "id": string,"notify"?: boolean }; Returns: number
                           },
"register_push_token":
{ Args: { "platform": string,"subscription"?: Json,"token": string }; Returns: string
                           },
"reject_member":
{ Args: { "member_id": string,"reason": string }; Returns: Json
                           },
"remove_event_staff":
{ Args: { "event_id": string,"member_id": string }; Returns: boolean
                           },
"request_block":
{ Args: { "member_id": string,"reason": string }; Returns: Json
                           },
"request_branch_transfer":
{ Args: { "member_id": string,"note"?: string,"reason"?: string,"to_branch_id": string }; Returns: Json
                           },
"request_info":
{ Args: { "member_id": string,"message": string }; Returns: Json
                           },
"review_report":
{ Args: { "action": string,"id": string,"note"?: string }; Returns: undefined
                           },
"rsvp":
{ Args: { "event_id": string,"member_id": string,"status"?: string }; Returns: string
                           },
"search_directory":
{ Args: { "branch_id"?: string,"page"?: number,"q"?: string }; Returns: {
              "branch_name": string,"city": string,"email": string,"full_name": string,"id": string,"occupation": string,"phone": string,"photo_path": string
            }[]
                           },
"set_event_staff":
{ Args: { "capabilities": (string)[],"event_id": string,"member_id": string }; Returns: undefined
                           },
"step_up_roles":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"submit_application":
{ Args: { "payload": Json }; Returns: Json
                           },
"submit_report":
{ Args: { "details"?: string,"reason": string,"target_id": string,"target_type": string }; Returns: string
                           },
"super_admin_remains":
{ Args: { "excluding_assignment": string,"excluding_member": string }; Returns: boolean
                           },
"sync_check_ins":
{ Args: { "event_id": string,"rows": Json }; Returns: Json
                           },
"unblock_member":
{ Args: { "member_id": string }; Returns: Json
                           },
"verify_member_id":
{ Args: { "member_id": string,"pass_version": number }; Returns: Json
                           },
"wake_notify_dispatch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"write_audit":
{ Args: { "action": string,"details"?: Json,"entity": string,"entity_id"?: string }; Returns: number
                           }
          }
          Enums: {
            "audience": "youth"|"aiaia"|"all","consent_method": "paper_form"|"phone_call"|"guardian_account"|"in_person"|"self_adult","member_status": "pending"|"active"|"rejected"|"suspended"|"deleted","role_scope": "global"|"national"|"branch"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "audience": ["youth", "aiaia", "all"],"consent_method": ["paper_form", "phone_call", "guardian_account", "in_person", "self_adult"],"member_status": ["pending", "active", "rejected", "suspended", "deleted"],"role_scope": ["global", "national", "branch"]
          }
        }
} as const
