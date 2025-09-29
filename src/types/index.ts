import { RowDataPacket } from "mysql2";

export interface FirmConfig {
  id: string;
  name: string;
  mongodb: {
    uri: string;
    dbName: string;
  };
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
}

export interface DatabaseConnections {
  mongoose: any;
  mysql: any;
}

export interface IActivityLog {
  userId: string;
  action: string;
  description: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  metadata?: any;
}

export interface IMessage {
  senderId: string;
  receiverId: string;
  message: string;
  messageType: 'text' | 'image' | 'file';
  conversationId: string;
  isRead: boolean;
  readAt?: Date;
  timestamp: Date;
}

export interface IUser {
  user_id?: number;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'driver' | 'moderator';
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}


export interface Territory extends RowDataPacket {
  territory_id?: number;
  territory_name?: string;
  territory_code?: string;
  manager_name?: string;
  manager_phone?: string;
  manager_email?: string;
  contractor_name?: string;
  contractor_phone?: string;
  contractor_email?: string;
  comments?: string;
  state_id?: number ;
  created_by?: number;
  updated_by?: number;
  created_date?: string ;
  updated_date?: string ;
  is_deleted?: boolean;
  is_active?: boolean;
};

export type Lab = {
  lab_id?: number;
  labcode?: string;
  lab_name?: string;
  lab_contact?: string;
  lab_phone?: string;
  lab_email?: string;
  lab_address?: string;
  lab_city?: string;
  lab_state?: string;
  lab_zip?: string;
  state_id?: number ;
  territory_id?: number ;
  comments?: string;
  created_by?: number;
  updated_by?: number;
  created_date?: string;
  updated_date?: string;
  is_deleted?: boolean;
  is_active?: boolean;
};


export type Delivery = {
  DeliveryId?: number;      
  territory: number;
  delivery_id: string;        
  delivery_name: string;      
  delivery_email: string;    
  delivery_phone: string;    
  delivery_fax: string;      
  delivery_address1: string; 
  delivery_address2: string; 
  delivery_city: string;     
  delivery_state: string;    
  delivery_zip: string;      
  delivery_manager: string;  
  Cmanager_email: string;    
  PT_count: string;          
  multiple_routes: boolean;
  time?: string ;        
  opendays?: string ;    
  draw_week: string;         
  draw_days: string;     
  comments: string;          
  priority: boolean;       
  lab_id: number;               
  created_by: string;        
  updated_by: string;        
  created_date?: string ;
  updated_date?: string ;
  is_deleted: boolean;     
  is_active?: boolean;         
};


export type Clinic = {
  ClinicId: number;
  territory_id?: number ;
  clinic_id: string ;
  clinic_name: string;
  clinic_email: string;
  clinic_phone: string;
  clinic_fax: string;
  clinic_address1: string;
  clinic_address2: string;
  clinic_city: string;
  clinic_state: string;
  clinic_zip: string;
  clinic_manager: string;
  Cmanager_email: string;
  PT_count: string;
  multiple_routes: boolean;
  lockbox: "combo" | "key" | "";
  combo?: string ;
  time?: string ;
  opendays?: string ;
  draw_week: string;
  draw_days?: string ;
  comments: string;
  priority: boolean;
  lab_id?: number ;
  created_by: number;
  updated_by: number;
  created_date?: string ;
  updated_date?: string ;
  is_deleted: boolean;
  clinic_password?: string ;
  delivery_id?: number ;
  ondemand: boolean;
  is_active?: boolean ;
  cutoff_time?: string ;
};

export interface Route {
  route_id: number;
  territory_id: number;
  route_name: string;
  day_week: string;
  comments: string;
  clinic: string;
  assigned_driver: number;
  delivery_id?: number;
  lab_id: number;
  assigned_at?: string ;
  created_by: number;
  updated_by: number;
  created_date?: string ;
  updated_date?: string ;
  is_deleted: number;  
  is_temporary: boolean; 
  temp_day?: string ;
  is_active?: boolean; 
  on_demand?: number; 
}
