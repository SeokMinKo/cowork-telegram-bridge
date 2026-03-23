export interface TgUpdate { update_id: number; message?: TgMessage; }
export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  text?: string; caption?: string;
  message_thread_id?: number;
  photo?: { file_id: string }[];
  document?: { file_id: string; file_name?: string };
  date: number;
}
