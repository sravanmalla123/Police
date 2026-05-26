import bcrypt from 'bcryptjs';
import { db } from '../config/db.js';
import { signToken } from '../utils/jwt.js';

const SALT_ROUNDS = 12;

/**
 * Authenticates a user by employee_id and password.
 * Returns { token, user } on success. Throws on failure.
 */
export async function loginUser({ loginId, password, role, accessMode }) {
  const user = await db.get(
    'SELECT id, employee_id, name, role, password, is_admin, zone, division, reporting_station, access_modes FROM users WHERE employee_id = ?',
    [loginId]
  );

  if (!user) {
    const err = new Error('Invalid credentials.'); err.status = 401; throw err;
  }

  if (user.is_admin && role === 'admin') {
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const err = new Error('Invalid credentials.'); err.status = 401; throw err;
    }
    const token = signToken({ userId: user.id, employeeId: user.employee_id, role: 'admin', name: user.name, accessMode: 'admin' });
    return {
      token,
      user: { id: user.id, employee_id: user.employee_id, name: user.name, role: 'admin', zone: user.zone, division: user.division, accessMode: 'admin' },
    };
  }

  // Backward compatibility check for legacy calls
  let selectedAccessMode = accessMode;
  let selectedRole = role;
  if (!selectedAccessMode && ['SB Control', 'SB Periscope', 'SB DSR'].includes(role)) {
    selectedAccessMode = role;
    selectedRole = 'Other';
  }

  // Check role match
  if (user.role !== selectedRole) {
    const err = new Error(`Account role is "${user.role}", but logged in as "${selectedRole}".`);
    err.status = 403;
    throw err;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    const err = new Error('Invalid credentials.'); err.status = 401; throw err;
  }

  // Validate selected login access mode
  const modes = user.access_modes ? user.access_modes.split(',').map(m => m.trim()) : [];
  if (!modes.includes(selectedAccessMode)) {
    const err = new Error(`Account is not authorized for "${selectedAccessMode}" access mode.`);
    err.status = 403;
    throw err;
  }

  const token = signToken({ 
    userId: user.id, 
    employeeId: user.employee_id,
    role: user.role, 
    name: user.name, 
    accessMode: selectedAccessMode 
  });

  return {
    token,
    user: { 
      id: user.id, 
      employee_id: user.employee_id,
      name: user.name, 
      role: user.role, 
      zone: user.zone, 
      division: user.division, 
      reporting_station: user.reporting_station,
      accessMode: selectedAccessMode 
    },
  };
}

/**
 * Returns all non-admin officers.
 */
export async function getOfficers() {
  return db.all('SELECT id, employee_id, name, role, zone, division, reporting_station, access_modes FROM users WHERE is_admin = 0');
}

/**
 * Seeds the initial admin and staff accounts on first boot.
 * All passwords are loaded from environment variables.
 */
export async function seedUsers() {
  // Seed Commissioner
  const admin = await db.get("SELECT id FROM users WHERE employee_id = 'commissioner'");
  if (!admin) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      console.warn('⚠️  SEED_ADMIN_PASSWORD not set — skipping commissioner account creation.');
    } else {
      const hash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
      await db.run(
        'INSERT INTO users (employee_id, name, role, password, is_admin) VALUES (?, ?, ?, ?, ?)',
        ['commissioner', 'Commissioner', 'admin', hash, 1]
      );
      console.log('✅ Commissioner account seeded.');
    }
  }

  const staffEnvMap = [
    { envKey: 'SEED_PASSWORD_CI',           employee_id: 'ci001',           name: 'Circle Inspector',     role: 'CI',           zone: 'West', division: 'West', access_modes: null },
    { envKey: 'SEED_PASSWORD_SI',           employee_id: 'si001',           name: 'Sub Inspector',         role: 'SI',           zone: 'West', division: 'West', access_modes: null },
    { envKey: 'SEED_PASSWORD_CONST',        employee_id: 'const001',        name: 'Constable',             role: 'Constable',    zone: 'West', division: 'West', access_modes: null },
    { envKey: 'SEED_PASSWORD_SB_CONTROL',   employee_id: 'sb_control001',   name: 'SB Control Officer',   role: 'Other',        zone: 'West', division: 'West', access_modes: 'SB Control' },
    { envKey: 'SEED_PASSWORD_SB_PERISCOPE', employee_id: 'sb_periscope001', name: 'SB Periscope Officer', role: 'Other',        zone: 'West', division: 'West', access_modes: 'SB Periscope' },
    { envKey: 'SEED_PASSWORD_SB_DSR',       employee_id: 'sb_dsr001',       name: 'SB DSR Officer',       role: 'Other',        zone: 'West', division: 'West', access_modes: 'SB DSR' },
    { envKey: 'SEED_PASSWORD_STAFF',        employee_id: 'staff001',        name: 'Police Staff',         role: 'Other',        zone: 'West', division: 'West', access_modes: null },
  ];

  for (const staff of staffEnvMap) {
    const exists = await db.get('SELECT id FROM users WHERE employee_id = ?', [staff.employee_id]);
    if (!exists) {
      let pw = process.env[staff.envKey];
      if (!pw) {
        pw = 'Staff@Police2026!';
        console.warn(`⚠️  ${staff.envKey} not set — using fallback password for ${staff.employee_id}.`);
      }
      const hash = await bcrypt.hash(pw, SALT_ROUNDS);
      await db.run(
        'INSERT INTO users (employee_id, name, role, password, zone, division, access_modes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [staff.employee_id, staff.name, staff.role, hash, staff.zone, staff.division, staff.access_modes || null]
      );
      console.log(`✅ Staff account seeded: ${staff.employee_id}`);
    }
  }

  const customStaffAccounts = [
    // West Zone & West Division
    { employee_id: '14382636', name: 'Abdul Kareem', role: 'SI', password: '7075388566', zone: 'West', division: 'West', reporting_station: 'Division Incharge', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383610', name: 'P.Srinivasa Rao', role: 'ASI', password: '9951343344', zone: 'West', division: 'West', reporting_station: 'Bhavanipuram PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382720', name: 'B.Pentaiah', role: 'HC', password: '9441280292', zone: 'West', division: 'West', reporting_station: 'Bhavanipuram PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382724', name: 'V.Sekhar Babu', role: 'HC', password: '9441714238', zone: 'West', division: 'West', reporting_station: 'I Town PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14384038', name: 'G.Taviti Naidu', role: 'HC', password: '9491932171', zone: 'West', division: 'West', reporting_station: 'Ibrahimpatnam PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14385177', name: 'G.Chaitanya Swamy', role: 'PC', password: '9550279555', zone: 'West', division: 'West', reporting_station: 'II Town PS', access_modes: 'SB Control,SB Periscope,SB DSR' },

    // East Zone & South Division
    { employee_id: '14383576', name: 'Habibu Rahman', role: 'ASI', password: '9441258047', zone: 'East', division: 'South', reporting_station: 'S.R.Pet PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14381374', name: 'R.Venkateswara Rao', role: 'HC', password: '9949335857', zone: 'East', division: 'South', reporting_station: 'S.R.Pet PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382798', name: 'M.Raju', role: 'HC', password: '9848841539', zone: 'East', division: 'South', reporting_station: 'G.R.Pet PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383580', name: 'T.Madhusudhana Rao', role: 'HC', password: '9948168383', zone: 'East', division: 'South', reporting_station: 'Krishna Lanka PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14384666', name: 'M.Bhadrachalam', role: 'PC', password: '8019786994', zone: 'East', division: 'South', reporting_station: 'S.R.Pet PS', access_modes: 'SB Control,SB Periscope,SB DSR' },

    // West Zone & North Division
    { employee_id: '14383293', name: 'Y.Parameswara Rao', role: 'SI', password: '9440495059', zone: 'West', division: 'North', reporting_station: 'Division Incharge', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382905', name: 'Ch.ArjunaRao', role: 'ASI', password: '9010340364', zone: 'West', division: 'North', reporting_station: 'S.N.Puram PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382567', name: 'L.Lakshmana Rao', role: 'ASI', password: '9885495555', zone: 'West', division: 'North', reporting_station: 'Nunna PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382891', name: 'G.Vijay Kumar', role: 'HC', password: '9985953785', zone: 'West', division: 'North', reporting_station: 'A.S.Nagar PS', access_modes: 'SB Control,SB Periscope,SB DSR' },

    // East Zone & Central Division
    { employee_id: '14382562', name: 'V.Sai Babu', role: 'ASI', password: '9652686868', zone: 'East', division: 'Central', reporting_station: 'Division Incharge', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382356', name: 'Md.Maqbool', role: 'HC', password: '9441270815', zone: 'East', division: 'Central', reporting_station: 'Patamata PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383081', name: 'D.Sudhakar', role: 'HC', password: '9866100195', zone: 'East', division: 'Central', reporting_station: 'Gunadala PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383624', name: 'N.Srinivasa Rao', role: 'HC', password: '9949894346', zone: 'East', division: 'Central', reporting_station: 'Machavaram PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382927', name: 'B.N.Singh', role: 'HC', password: '8125945944', zone: 'East', division: 'Central', reporting_station: 'Patamata PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14384184', name: 'P.Rajesh', role: 'HC', password: '8008461827', zone: 'East', division: 'Central', reporting_station: 'Machavaram PS', access_modes: 'SB Control,SB Periscope,SB DSR' },

    // Rural Zone & Nandigama Division
    { employee_id: '14383292', name: 'M.Rama Mohana Rao', role: 'SI', password: '9440413114', zone: 'Rural', division: 'Nandigama', reporting_station: 'Division Incharge', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14113517', name: 'M.Srinivasa Rao', role: 'ASI', password: '9848013787', zone: 'Rural', division: 'Nandigama', reporting_station: 'Jaggaiahpet PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14113100', name: 'Enitulla', role: 'HC', password: '8498031088', zone: 'Rural', division: 'Nandigama', reporting_station: 'Kanchikacherla PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14113288', name: 'Ch. Vijay Kumar', role: 'HC', password: '9000345548', zone: 'Rural', division: 'Nandigama', reporting_station: 'Nandigama PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14113727', name: 'K.V.Rama Rao', role: 'HC', password: '9440731708', zone: 'Rural', division: 'Nandigama', reporting_station: 'Penuganchiprolu PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14130277', name: 'Ch.Daniel', role: 'PC', password: '9491963695', zone: 'Rural', division: 'Nandigama', reporting_station: 'Chillakallu PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14132999', name: 'D.Sardhar', role: 'PC', password: '9490001129', zone: 'Rural', division: 'Nandigama', reporting_station: 'Chandarlapadu PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14130365', name: 'A.Sudhakar', role: 'PC', password: '8500851241', zone: 'Rural', division: 'Nandigama', reporting_station: 'Vatsavai PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14134523', name: 'R.Raja Rao', role: 'PC', password: '9703526099', zone: 'Rural', division: 'Nandigama', reporting_station: 'Veerulapadu PS', access_modes: 'SB Control,SB Periscope,SB DSR' },

    // Rural Zone & Mylavaram Division
    { employee_id: '14476599', name: 'K.Prameela', role: 'WSI', password: '9666223519', zone: 'Rural', division: 'Mylavaram', reporting_station: 'Mylavaram Division Incharge', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: 'g1184', name: 'P.V.Venu Gopal Rao', role: 'ASI', password: '9398671919', zone: 'Rural', division: 'Mylavaram', reporting_station: 'Mylavaram PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383368', name: 'M.Sree Mouli Babu', role: 'HC', password: '6304747946', zone: 'Rural', division: 'Mylavaram', reporting_station: 'G.Konduru PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: 'g689', name: 'P.Rambabu', role: 'HC', password: '7794831689', zone: 'Rural', division: 'Mylavaram', reporting_station: 'Vissannapet PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: 'g877', name: 'T.Madhava Rao', role: 'HC', password: '9908687759', zone: 'Rural', division: 'Mylavaram', reporting_station: 'Tiruvuru PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14134413', name: 'D.Ramesh', role: 'PC', password: '7013237756', zone: 'Rural', division: 'Mylavaram', reporting_station: 'A.Konduru PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14134067', name: 'S.Satyanarayana', role: 'PC', password: '8919063884', zone: 'Rural', division: 'Mylavaram', reporting_station: 'Gampalagudem PS', access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14471185', name: 'P.Gopala Krishna', role: 'PC', password: '9494320430', zone: 'Rural', division: 'Mylavaram', reporting_station: 'Reddigudem PS', access_modes: 'SB Control,SB Periscope,SB DSR' },

    // Organizations
    { employee_id: '14113493', name: 'K.Sambasiva Rao', role: 'SI', password: '7901693811', zone: 'Organizations', division: 'Organizations Incharge', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382714', name: 'G.V.Paideswara Rao', role: 'ASI', password: '9440783002', zone: 'Organizations', division: 'CCS, CMS, CAR, PCR, Mahila, Cyber Crime, CPO', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14126314', name: 'A.Subba Rao', role: 'ASI', password: '9391255326', zone: 'Organizations', division: 'CPI', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382533', name: 'N.Anji Babu', role: 'ASI', password: '9505675994', zone: 'Organizations', division: 'Mala Mahanadu, SC & ST Organization & Christian Organization', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383349', name: 'K.Narasimha Rao', role: 'ASI', password: '9492938977', zone: 'Organizations', division: 'Railway, RTC and Electricity, MCV, Miscellaneous', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382355', name: 'B.Y.Das', role: 'HC', password: '9885370043', zone: 'Organizations', division: 'Outsourcing & Miscellaneous', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382371', name: 'T.Jojappa', role: 'HC', password: '9948851288', zone: 'Organizations', division: 'CPM', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383611', name: 'N.V.V.Rao', role: 'HC', password: '9848118347', zone: 'Organizations', division: 'Students & Teachers Organizations', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383095', name: 'G.Srinivasa Rao', role: 'HC', password: '9949646845', zone: 'Organizations', division: 'NGOs, Volunteers, Congress', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382706', name: 'M.A.Ahmed', role: 'HC', password: '7680896965', zone: 'Organizations', division: 'CI Cell', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383422', name: 'D.Srinivasu', role: 'HC', password: '8143777747', zone: 'Organizations', division: 'BJP', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14384063', name: 'V.Trimurthulu', role: 'HC', password: '9394276321', zone: 'Organizations', division: "BC's", reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14384135', name: 'R.Sankara Rao', role: 'HC', password: '8985441200', zone: 'Organizations', division: 'Mahila Wing & Out sourcing Emp', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '11382922', name: 'M.Vijay Kumar', role: 'HC', password: '7812191163', zone: 'Organizations', division: 'CI Cell', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14376320', name: 'Sri K.V.V.Anjaneyulu', role: 'HC', password: '8523020289', zone: 'Organizations', division: 'TDP', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383134', name: 'B.Satyanarayana', role: 'HC', password: '7330937585', zone: 'Organizations', division: 'YSRCP', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14467748', name: 'B.Deva Narasimha', role: 'PC', password: '7013254203', zone: 'Organizations', division: 'Press Club', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14382590', name: 'T.Jashuva Raju', role: 'HC', password: '9948333888', zone: 'Organizations', division: 'CI Cell', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14384642', name: 'T.Srikanth', role: 'PC', password: '8121297717', zone: 'Organizations', division: 'Airport', reporting_station: null, access_modes: 'SB Control' },

    // SB Office Duties
    { employee_id: '14383369', name: 'R.V.S.Prasad', role: 'ASI', password: '7013434393', zone: 'Office', division: 'Office Morning Duty', reporting_station: null, access_modes: 'SB Control,SB DSR' },
    { employee_id: '14383113', name: 'M.V.Sambasiva Rao', role: 'ASI', password: '9440103603', zone: 'Office', division: 'Administrative Officer', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR' },
    { employee_id: '14383390', name: 'N.V.Ramesh', role: 'HC', password: '9676763232', zone: 'Office', division: 'Computer Operator', reporting_station: null, access_modes: 'SB Control,SB Periscope' },
    { employee_id: '11382912', name: 'K.V.Prasad', role: 'HC', password: '9316212093', zone: 'Office', division: 'Paper Cutting', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '14383551', name: 'A.E.Nanda Kumar', role: 'HC', password: '7780131137', zone: 'Office', division: 'E Deployment', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '14382549', name: 'S.Brahmaiah', role: 'HC', password: '9346963298', zone: 'Office', division: 'Writer', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '14383558', name: 'Y.Ramesh', role: 'HC', password: '9989677792', zone: 'Office', division: 'Passports', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '14382448', name: 'P.Naga Raju', role: 'HC', password: '9492525237', zone: 'Office', division: 'E Deployment', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '14458579', name: 'B.Krishna Kanth Naik', role: 'PC', password: '8886880908', zone: 'Office', division: 'Computer Operator', reporting_station: null, access_modes: 'SB Control,SB Periscope' },
    { employee_id: 'g2322', name: 'K.N.Venkateswara Rao', role: 'PC', password: '9603414121', zone: 'Office', division: 'Office Duty', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '14467665', name: 'A.Bujji Babu', role: 'PC', password: '9014914406', zone: 'Office', division: 'A.P.R.O', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: '1000038811', name: 'Ch.Vinay Kumar', role: 'Other', password: '9000330796', zone: 'Office', division: 'Computer Operator', reporting_station: null, access_modes: 'SB Control,SB Periscope' },

    // Commissionerate & IPS Officers
    { employee_id: 'cp', name: 'S.V.Raja Shekara Babu, IPS', role: 'CP', password: '8008111070', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control', is_admin: true },
    { employee_id: 'dcp_admin', name: 'K.G.V Saritha, IPS', role: 'DCP', password: '9490619340', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control', is_admin: true },
    { employee_id: 'dcp_east', name: 'Krishna Kanth Patel, IPS', role: 'DCP', password: '9490619339', zone: 'Commissionerate', division: 'East Zone', reporting_station: null, access_modes: 'SB Control', is_admin: true },
    { employee_id: 'dcp_rural', name: 'B.Lakshminarayana, IPS', role: 'DCP', password: '9490619342', zone: 'Commissionerate', division: 'Rural Zone', reporting_station: null, access_modes: 'SB Control', is_admin: true },
    { employee_id: 'adcp_west', name: 'G.Rama Krishna', role: 'ADCP', password: '9490493192', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control', is_admin: true },
    { employee_id: 'g5040', name: 'N.Bhanu Prakash Reddy', role: 'ACP', password: '9440627031', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR', is_admin: true },
    { employee_id: '14376515', name: 'Y.Bala Rajaji', role: 'CI', password: '9063702894', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR', is_admin: true },
    { employee_id: 'g6060', name: 'V.Srinivasa Rao', role: 'CI', password: '9440627032', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR', is_admin: true },
    { employee_id: 'ci002', name: 'B.Satyanarayana', role: 'CI', password: '9963396080', zone: 'Commissionerate', division: 'NTR Police Commissionerate', reporting_station: null, access_modes: 'SB Control,SB Periscope,SB DSR', is_admin: true },

    // CSB ID Section
    { employee_id: 'ao001', name: 'Sri Ch.V. Sambasiva Rao', role: 'AO', password: '9885527777', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB Control' },
    { employee_id: 'dyao001', name: 'Sri P.Subrahmanyam', role: 'Dy.AO', password: '9052959529', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB DSR' },
    { employee_id: 'dyao002', name: 'Sri M.Srinivasas Rao', role: 'Dy.AO', password: '9390214880', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB DSR' },
    { employee_id: 'aao001', name: 'Sri K.S.Dada Kalandhar', role: 'AAO', password: '9297007281', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB DSR' },
    { employee_id: 'aao002', name: 'Sri K.Bala Subrahmanyam', role: 'AAO', password: '9492486754', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB DSR' },
    { employee_id: 'aao003', name: 'Sri S.V.Siva Kumar', role: 'AAO', password: '9985560656', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB DSR' },
    { employee_id: 'aao004', name: 'Smt. D. Pavani', role: 'AAO', password: '9154800070', zone: 'ID Section', division: 'CSB ID Section', reporting_station: null, access_modes: 'SB DSR' }
  ];

  for (const staff of customStaffAccounts) {
    const exists = await db.get('SELECT id FROM users WHERE employee_id = ?', [staff.employee_id]);
    if (!exists) {
      const hash = await bcrypt.hash(staff.password, SALT_ROUNDS);
      await db.run(
        'INSERT INTO users (employee_id, name, role, password, zone, division, reporting_station, access_modes, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [staff.employee_id, staff.name, staff.role, hash, staff.zone, staff.division, staff.reporting_station, staff.access_modes, staff.is_admin ? 1 : 0]
      );
      console.log(`✅ Custom staff account seeded: ${staff.employee_id} (${staff.name})`);
    }
  }

  // Retrofit query to update reporting_station for existing seeded accounts
  for (const staff of customStaffAccounts) {
    try {
      await db.run(
        'UPDATE users SET reporting_station = ? WHERE employee_id = ?',
        [staff.reporting_station, staff.employee_id]
      );
    } catch (err) {
      console.error(`Failed to retrofit reporting_station for ${staff.employee_id}:`, err.message);
    }
  }
  console.log('✅ Retrofitted custom staff accounts with reporting_station values');

  // Retrofit query to update K.Prameela to WSI role
  try {
    await db.run("UPDATE users SET role = 'WSI' WHERE employee_id = '14476599'");
    console.log("✅ Retrofitted K.Prameela to WSI role");
  } catch (err) {
    console.error('Failed to retrofit K.Prameela role:', err.message);
  }

  // Retrofit query to assign default values to existing users with NULL zone/division
  try {
    await db.run("UPDATE users SET zone = 'West', division = 'West' WHERE is_admin = 0 AND (zone IS NULL OR division IS NULL)");
    console.log('✅ Retrofitted existing staff users with default zone and division');
  } catch (err) {
    console.error('Failed to retrofit zone/division:', err.message);
  }

  // Retrofit existing users to map their role to access_modes if they are SB roles and reset role to 'Other'
  try {
    await db.run("UPDATE users SET access_modes = 'SB Control', role = 'Other' WHERE role = 'SB Control' AND (access_modes IS NULL OR access_modes = '')");
    await db.run("UPDATE users SET access_modes = 'SB Periscope', role = 'Other' WHERE role = 'SB Periscope' AND (access_modes IS NULL OR access_modes = '')");
    await db.run("UPDATE users SET access_modes = 'SB DSR', role = 'Other' WHERE role = 'SB DSR' AND (access_modes IS NULL OR access_modes = '')");
    // Assign access modes to the traditional seed users
    await db.run("UPDATE users SET access_modes = 'SB Control,SB Periscope,SB DSR' WHERE employee_id IN ('ci001', 'si001', 'const001', 'staff001') AND (access_modes IS NULL OR access_modes = '')");
    console.log('✅ Retrofitted existing staff users with access_modes and role resets');
  } catch (err) {
    console.error('Failed to retrofit access_modes:', err.message);
  }
}

/**
 * Creates a new staff user.
 * Checks for existing employee_id first.
 */
export async function createStaffUser({ employeeId, name, role, password, zone, division, reportingStation, accessModes }) {
  const exists = await db.get('SELECT id FROM users WHERE employee_id = ?', [employeeId]);
  if (exists) {
    const err = new Error(`Employee ID "${employeeId}" already exists.`);
    err.status = 400;
    throw err;
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await db.run(
    'INSERT INTO users (employee_id, name, role, password, is_admin, zone, division, reporting_station, access_modes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [employeeId, name, role, hash, 0, zone || null, division || null, reportingStation || null, accessModes || null]
  );
  return { id: result.insertId, employee_id: employeeId, name, role, zone, division, reporting_station: reportingStation, access_modes: accessModes };
}

/**
 * Deletes a staff user by ID (only if they are not admin).
 */
export async function deleteUserById(userId) {
  const result = await db.run('DELETE FROM users WHERE id = ? AND is_admin = 0', [userId]);
  if (result.affectedRows === 0) {
    const err = new Error('Staff user not found or cannot be deleted.');
    err.status = 404;
    throw err;
  }
  return { success: true };
}

/**
 * Impersonates a staff user by employee_id without requiring a password.
 * Returns { token, user } on success.
 */
export async function impersonateUser({ employeeId }) {
  const user = await db.get(
    'SELECT id, employee_id, name, role, is_admin, zone, division, reporting_station, access_modes FROM users WHERE employee_id = ? AND is_admin = 0',
    [employeeId]
  );

  if (!user) {
    const err = new Error('Staff user not found.');
    err.status = 404;
    throw err;
  }

  // Determine the access mode. Pick the first allowed access mode, or default to 'SB Control'
  const modes = user.access_modes ? user.access_modes.split(',').map(m => m.trim()) : [];
  const selectedAccessMode = modes[0] || 'SB Control';

  const token = signToken({ 
    userId: user.id, 
    employeeId: user.employee_id,
    role: user.role, 
    name: user.name, 
    accessMode: selectedAccessMode 
  });

  return {
    token,
    user: { 
      id: user.id, 
      employee_id: user.employee_id,
      name: user.name, 
      role: user.role, 
      zone: user.zone, 
      division: user.division, 
      reporting_station: user.reporting_station,
      accessMode: selectedAccessMode 
    },
  };
}

/**
 * Fetches a user profile by ID.
 */
export async function getUserById(userId) {
  return await db.get(
    'SELECT id, employee_id, name, role, is_admin, zone, division, reporting_station, access_modes FROM users WHERE id = ?',
    [userId]
  );
}

