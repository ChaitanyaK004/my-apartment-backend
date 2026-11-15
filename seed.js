// Run:  npm run seed          (fills every EMPTY collection with sample data; collections that already have data are left alone)
//       npm run seed -- --force   (wipes the sample collections first, then fills them)
// Login accounts are separate: npm run seed-users
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, explainConnectionError } from "./config/db.js";
import Resident from "./models/Resident.js";
import Complaint from "./models/Complaint.js";
import Visitor from "./models/Visitor.js";
import Notice from "./models/Notice.js";
import ParkingReservation from "./models/ParkingReservation.js";
import SecurityStaff from "./models/SecurityStaff.js";
import Incident from "./models/Incident.js";
import MaintenanceStaff from "./models/MaintenanceStaff.js";
import MaintenanceRequest from "./models/MaintenanceRequest.js";
import Payment from "./models/Payment.js";
import FacilityBooking from "./models/FacilityBooking.js";
import CommunityPost from "./models/CommunityPost.js";
import { Counter } from "./utils/nextId.js";

const d = (s) => new Date(s);

const residents = [
  { id: "RES-001", name: "Arjun Mehta", flat: "A-1203", mobile: "+91 98765 43210", email: "arjun@myapartment.com", username: "arjun", type: "Owner", status: "Active", moveInDate: d("2025-01-15") },
  { id: "RES-002", name: "Priya Patel", flat: "C-502", mobile: "+91 98765 43211", email: "priya@myapartment.com", username: "priya", type: "Tenant", status: "Active", moveInDate: d("2025-02-10") },
  { id: "RES-003", name: "Rahul Sharma", flat: "B-304", mobile: "+91 98765 43212", email: "rahul@gmail.com", type: "Owner", status: "Active", moveInDate: d("2024-12-05") },
  { id: "RES-004", name: "Amit Singh", flat: "D-204", mobile: "+91 98765 43213", email: "amit@gmail.com", type: "Tenant", status: "Inactive", moveInDate: d("2025-03-20") },
  { id: "RES-005", name: "Sneha Pillai", flat: "A-1102", mobile: "+91 98765 43214", email: "sneha@gmail.com", type: "Owner", status: "Active", moveInDate: d("2025-04-01") },
];

const complaints = [
  { id: "C001", title: "Water Leakage in Bathroom", category: "Water", resident: "Arjun Mehta", flat: "A-1203", priority: "High", status: "Resolved", description: "Water is leaking from the bathroom ceiling near the shower area.", createdAt: d("2026-05-23") },
  { id: "C002", title: "Parking Problem", category: "Parking", resident: "Priya Patel", flat: "C-502", priority: "Medium", status: "In Progress", description: "Another vehicle is frequently using my allocated parking slot.", createdAt: d("2026-05-21") },
  { id: "C003", title: "Lift Maintenance Request", category: "Common Area", resident: "Rahul Sharma", flat: "B-304", priority: "High", status: "Pending", description: "The lift makes a loud noise and stops briefly between floors.", createdAt: d("2026-05-20") },
  { id: "C004", title: "Electricity Problem", category: "Electrical", resident: "Amit Singh", flat: "D-204", priority: "Low", status: "Pending", description: "The street light near the D wing entrance has not been working.", createdAt: d("2026-05-18") },
  { id: "C005", title: "Unknown person near Tower C", category: "Security", resident: "Arjun Mehta", flat: "A-1203", priority: "High", status: "Pending", description: "An unknown person was noticed near the Tower C service entrance." },
];

const visitors = [
  { id: "VIS-497", name: "Kavita Rao", purpose: "Personal Visit", resident: "Sneha Pillai", flat: "A-1102", phone: "+91 98765 10105", vehicle: "MH 09 CD 5577", visitTime: d("2026-05-24T14:10:00+05:30"), status: "Checked Out", checkedInAt: d("2026-05-24T14:12:00+05:30"), checkedOutAt: d("2026-05-24T16:05:00+05:30") },
  { id: "VIS-498", name: "Sunil Kumar", purpose: "Service Provider", resident: "Amit Singh", flat: "D-204", phone: "+91 98765 10104", vehicle: "-", visitTime: d("2026-05-25T16:40:00+05:30"), status: "Pending" },
  { id: "VIS-499", name: "Priya Desai", purpose: "Personal Visit", resident: "Rahul Sharma", flat: "B-304", phone: "+91 98765 10103", vehicle: "MH 09 XY 9821", visitTime: d("2026-05-26T11:20:00+05:30"), status: "Approved" },
  { id: "VIS-500", name: "Amit Shah", purpose: "Delivery", resident: "Priya Patel", flat: "C-502", phone: "+91 98765 10102", vehicle: "-", visitTime: d("2026-05-27T18:15:00+05:30"), status: "Checked Out", checkedInAt: d("2026-05-27T18:16:00+05:30"), checkedOutAt: d("2026-05-27T18:25:00+05:30") },
  { id: "VIS-501", name: "Rahul Patil", purpose: "Personal Visit", resident: "Arjun Mehta", flat: "A-1203", phone: "+91 98765 10101", vehicle: "MH 09 AB 2345", visitTime: d("2026-05-28T10:30:00+05:30"), status: "Checked In", checkedInAt: d("2026-05-28T10:32:00+05:30") },
];

const notices = [
  { id: "NT-100", title: "June Maintenance Payment Reminder", category: "Payments", audience: "All Residents", pinned: false, reads: 190, body: "Kindly complete your June maintenance payment by 5 June 2026 to avoid a late payment charge.", createdAt: d("2026-05-20") },
  { id: "NT-101", title: "Swimming Pool Timings Revised", category: "Facilities", audience: "All Residents", pinned: false, reads: 165, body: "Swimming pool timings are now 7:00 AM to 8:00 PM. Children below 12 years must be accompanied by an adult.", createdAt: d("2026-05-22") },
  { id: "NT-102", title: "New Visitor Entry Guidelines", category: "Security", audience: "All Residents", pinned: false, reads: 203, body: "All visitors must be pre-approved through the society portal. Please ensure delivery partners and service providers have the correct flat number before arrival.", createdAt: d("2026-05-25") },
  { id: "NT-103", title: "Annual General Meeting 2026", category: "Community", audience: "All Owners", pinned: true, reads: 178, body: "The Annual General Meeting will be held on 15 June 2026 at 5:00 PM in the Clubhouse. The agenda and supporting documents will be shared shortly.", createdAt: d("2026-05-28") },
  { id: "NT-104", title: "Scheduled Water Supply Maintenance", category: "Maintenance", audience: "All Residents", pinned: true, reads: 214, body: "Water supply will be temporarily unavailable from 10:00 AM to 1:00 PM on Saturday due to scheduled pipeline maintenance. Please store sufficient water in advance.", createdAt: d("2026-05-30") },
  { id: "NT-105", type: "Poll", title: "Community meeting: which day works best?", category: "Community", audience: "All Residents", pinned: false, reads: 40, body: "We are planning a community meeting about the new garden. Please vote for the day that suits you.", pollOptions: [{ text: "Saturday evening" }, { text: "Sunday morning" }, { text: "Weekday after 8 PM" }], voters: [{ voter: "priya@gmail.com", optionIndex: 0 }, { voter: "rahul@gmail.com", optionIndex: 1 }], createdAt: d("2026-06-01") },
  { id: "NT-106", type: "Suggestion", title: "Suggestion: add more visitor parking", category: "Facilities", audience: "All Residents", pinned: false, reads: 12, body: "Many guests struggle to find parking on weekends. Residents are invited to share ideas.", createdAt: d("2026-06-02") },
];

const parking = [
  { id: "PRK-001", type: "Resident Reserved", residentName: "Arjun Mehta", flat: "A-1203", vehicleNumber: "MH 12 AB 4821", slot: "A-01", fromTime: d("2026-06-01T08:00:00+05:30"), toTime: d("2026-06-30T20:00:00+05:30") },
  { id: "PRK-002", type: "Resident Reserved", residentName: "Priya Patel", flat: "C-502", vehicleNumber: "MH 12 QP 7108", slot: "B-11", fromTime: d("2026-06-01T09:00:00+05:30"), toTime: d("2026-06-30T21:00:00+05:30") },
  { id: "PRK-003", type: "Visitor", residentName: "Rahul Sharma", flat: "B-304", vehicleNumber: "MH 09 XY 9821", slot: "A-04", fromTime: d("2026-06-05T18:00:00+05:30"), toTime: d("2026-06-05T23:00:00+05:30"), status: "Completed" },
];

const securityStaff = [
  { id: "SEC-001", name: "Ramesh Kumar", phone: "+91 98765 20001", post: "Main Gate", shift: "Morning", shiftStart: "06:00", shiftEnd: "14:00", dutyStatus: "On Duty", username: "guard" },
  { id: "SEC-002", name: "Suresh Yadav", phone: "+91 98765 20002", post: "Tower C Gate", shift: "Evening", shiftStart: "14:00", shiftEnd: "22:00", dutyStatus: "Off Duty" },
  { id: "SEC-003", name: "Manoj Thakur", phone: "+91 98765 20003", post: "Basement Parking", shift: "Night", shiftStart: "22:00", shiftEnd: "06:00", dutyStatus: "Off Duty" },
  { id: "SEC-004", name: "Anita Sawant", phone: "+91 98765 20004", post: "Clubhouse", shift: "General", shiftStart: "09:00", shiftEnd: "18:00", dutyStatus: "On Break" },
];

const incidents = [
  { id: "INC-001", title: "Unknown person near Tower C", type: "Suspicious Activity", description: "An unknown person was noticed near the Tower C service entrance around 11 PM.", location: "Tower C service entrance", severity: "High", status: "Investigating", reportedBy: "Arjun Mehta", reporterUsername: "arjun", reporterRole: "Resident", flat: "A-1203", occurredAt: d("2026-05-29T23:05:00+05:30") },
  { id: "INC-002", title: "Car parked in fire lane", type: "Vehicle", description: "White hatchback MH 12 KL 8890 left in the fire lane for 3 hours.", location: "Tower B driveway", severity: "Medium", status: "Resolved", reportedBy: "Ramesh Kumar", reporterUsername: "guard", reporterRole: "Security Guard", actionTaken: "Owner contacted, vehicle moved.", occurredAt: d("2026-05-27T15:20:00+05:30"), resolvedAt: d("2026-05-27T16:00:00+05:30") },
  { id: "INC-003", title: "Basement light flickering", type: "Fire / Safety", description: "Two tube lights in basement level 2 are flickering, low visibility near ramp.", location: "Basement B2", severity: "Low", status: "Open", reportedBy: "Manoj Thakur", reporterUsername: "", reporterRole: "Security Guard", occurredAt: d("2026-05-30T02:10:00+05:30") },
];

const maintenanceStaff = [
  { id: "MNT-001", name: "Ravi Shinde", phone: "+91 98765 30001", jobRole: "Senior Plumber", category: "Plumbing", workStatus: "Busy", username: "ravi" },
  { id: "MNT-002", name: "Deepak Jadhav", phone: "+91 98765 30002", jobRole: "Electrician", category: "Electrical", workStatus: "Available" },
  { id: "MNT-003", name: "Meena Kamble", phone: "+91 98765 30003", jobRole: "Housekeeping Lead", category: "Cleaning", workStatus: "Available" },
  { id: "MNT-004", name: "Imran Shaikh", phone: "+91 98765 30004", jobRole: "Handyman", category: "General Repairs", workStatus: "On Leave" },
];

const maintenanceRequests = [
  { id: "MR-001", title: "Kitchen sink leaking", category: "Plumbing", description: "Water drips from the pipe under the kitchen sink and the cabinet floor stays wet.", flat: "A-1203", residentName: "Arjun Mehta", residentUsername: "arjun", residentPhone: "+91 98765 43210", priority: "High", status: "In Progress", assignedTo: "MNT-001", assignedToName: "Ravi Shinde", assignedAt: d("2026-05-28T10:00:00+05:30"), createdAt: d("2026-05-28T09:15:00+05:30"),
    history: [{ status: "Pending", note: "Request submitted", by: "Arjun Mehta", at: d("2026-05-28T09:15:00+05:30") }, { status: "Assigned", note: "Assigned to Ravi Shinde", by: "Society Admin", at: d("2026-05-28T10:00:00+05:30") }, { status: "In Progress", note: "Replacing the trap joint", by: "Ravi Shinde", at: d("2026-05-28T15:30:00+05:30") }] },
  { id: "MR-002", title: "Bedroom switchboard sparking", category: "Electrical", description: "The main switchboard in the bedroom sparks when the AC is turned on.", flat: "C-502", residentName: "Priya Patel", residentUsername: "priya", priority: "High", status: "Pending", createdAt: d("2026-05-30T08:40:00+05:30"),
    history: [{ status: "Pending", note: "Request submitted", by: "Priya Patel", at: d("2026-05-30T08:40:00+05:30") }] },
  { id: "MR-003", title: "Lobby deep cleaning", category: "Cleaning", description: "Tower B lobby floor needs deep cleaning after the painting work.", flat: "B-304", residentName: "Rahul Sharma", priority: "Low", status: "Completed", assignedTo: "MNT-003", assignedToName: "Meena Kamble", assignedAt: d("2026-05-25T11:00:00+05:30"), completedAt: d("2026-05-26T13:00:00+05:30"), createdAt: d("2026-05-25T10:00:00+05:30"),
    history: [{ status: "Pending", note: "Request submitted", by: "Rahul Sharma", at: d("2026-05-25T10:00:00+05:30") }, { status: "Assigned", note: "Assigned to Meena Kamble", by: "Society Admin", at: d("2026-05-25T11:00:00+05:30") }, { status: "Completed", note: "Lobby cleaned and polished", by: "Meena Kamble", at: d("2026-05-26T13:00:00+05:30") }] },
  { id: "MR-004", title: "Balcony door hinge broken", category: "General Repairs", description: "The balcony sliding door has come off its track.", flat: "A-1203", residentName: "Arjun Mehta", residentUsername: "arjun", priority: "Medium", status: "Pending", createdAt: d("2026-05-31T18:20:00+05:30"),
    history: [{ status: "Pending", note: "Request submitted", by: "Arjun Mehta", at: d("2026-05-31T18:20:00+05:30") }] },
];

const payments = [
  { id: "PAY-1024", resident: "Arjun Mehta", flat: "A-1203", month: "June 2026", amount: 4350, date: "05 Jun 2026", method: "UPI", status: "Paid" },
  { id: "PAY-1023", resident: "Priya Patel", flat: "C-502", month: "June 2026", amount: 4350, date: "04 Jun 2026", method: "Card", status: "Paid" },
  { id: "PAY-1022", resident: "Rahul Sharma", flat: "B-304", month: "June 2026", amount: 4350, date: "-", method: "-", status: "Pending" },
  { id: "PAY-1021", resident: "Amit Singh", flat: "D-204", month: "June 2026", amount: 4350, date: "-", method: "-", status: "Overdue" },
  { id: "PAY-1020", resident: "Sneha Pillai", flat: "A-1102", month: "May 2026", amount: 4350, date: "03 May 2026", method: "Net Banking", status: "Paid" },
];

const communityPosts = [
  { id: "POST-001", author: "Priya Patel", flat: "C-502", initials: "PP", tag: "Recommendation", text: "Can anyone recommend a reliable piano teacher for weekend lessons?", likes: [], comments: [] },
  { id: "POST-002", author: "Rahul Sharma", flat: "B-304", initials: "RS", tag: "Community", text: "The Sunday badminton group has a few open spots. Beginners are very welcome!", likes: [], comments: [] },
  { id: "POST-003", author: "Arjun Mehta", flat: "A-1203", initials: "AM", tag: "Buy & Sell", text: "Selling a barely-used study desk. Please message me if you are interested.", likes: [], comments: [] },
];

const facilityBookings = [
  { id: "BK-001", facilityId: "clubhouse", facilityName: "Clubhouse", residentName: "Arjun Mehta", flat: "A-1203", date: "2026-06-15", slot: "6:00 PM", fee: "₹1,500 / slot", status: "Confirmed" },
  { id: "BK-002", facilityId: "court", facilityName: "Badminton Court", residentName: "Rahul Sharma", flat: "B-304", date: "2026-06-16", slot: "7:00 AM", fee: "₹150 / hour", status: "Confirmed" },
];

const sets = [
  [Resident, residents, "resident", 5],
  [Complaint, complaints, "complaint", 5],
  [Visitor, visitors, "visitor", 501],
  [Notice, notices, "notice", 106],
  [ParkingReservation, parking, "parking", 3],
  [SecurityStaff, securityStaff, "security_staff", 4],
  [Incident, incidents, "incident", 3],
  [MaintenanceStaff, maintenanceStaff, "maintenance_staff", 4],
  [MaintenanceRequest, maintenanceRequests, "maintenance_request", 4],
  [Payment, payments, "payment", 1024],
  [CommunityPost, communityPosts, "community_post", 3],
  [FacilityBooking, facilityBookings, "facility_booking", 2],
];

try {
  await connectDB();
  const force = process.argv.includes("--force");
  let added = 0;
  for (const [Model, docs, key, seq] of sets) {
    const existing = await Model.countDocuments();
    if (existing && !force) {
      console.log(`⏭  ${Model.collection.name}: already has ${existing} documents, left unchanged`);
      continue;
    }
    await Model.deleteMany({});
    await Model.insertMany(docs);
    await Counter.findOneAndUpdate({ _id: key }, { $set: { seq } }, { upsert: true });
    console.log(`🌱 ${Model.collection.name}: ${docs.length} documents`);
    added++;
  }
  console.log(added ? "\n✅ Sample data added. Open Compass / mongosh to see it." : "\n⚠️  Nothing changed. To wipe and re-seed run: npm run seed -- --force");
  await mongoose.disconnect();
} catch (err) {
  explainConnectionError(err);
  process.exit(1);
}
