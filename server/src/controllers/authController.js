import { loginUser, getOfficers, createStaffUser, deleteUserById, impersonateUser, getUserById } from '../services/authService.js';

export async function login(req, res, next) {
  try {
    const { loginId, password, role, accessMode } = req.body;
    const result = await loginUser({ loginId, password, role, accessMode });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function officers(req, res, next) {
  try {
    const list = await getOfficers();
    return res.json({ success: true, officers: list });
  } catch (err) {
    next(err);
  }
}

export async function createStaff(req, res, next) {
  try {
    const { employeeId, name, role, password, zone, division, reportingStation, accessModes } = req.body;
    if (!employeeId || !role || !password) {
      return res.status(400).json({ success: false, message: 'All fields (employeeId, role, password) are required.' });
    }
    const allowedRoles = ['CI', 'SI', 'WSI', 'ASI', 'HC', 'PC', 'Other'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be CI, SI, WSI, ASI, HC, PC, or Other.' });
    }

    if (accessModes) {
      const allowedModes = ['SB Control', 'SB Periscope', 'SB DSR'];
      const modesArray = Array.isArray(accessModes) ? accessModes : [accessModes];
      for (const mode of modesArray) {
        if (!allowedModes.includes(mode)) {
          return res.status(400).json({ success: false, message: `Invalid access mode: ${mode}. Must be SB Control, SB Periscope, or SB DSR.` });
        }
      }
    }
    
    // Auto-generate display name based on role if no custom name is provided
    let displayName = name?.trim() || '';
    if (!displayName) {
      displayName = 'Police Staff';
      if (role === 'CI') displayName = 'Circle Inspector';
      else if (role === 'SI') displayName = 'Sub Inspector';
      else if (role === 'WSI') displayName = 'Woman Sub Inspector';
      else if (role === 'ASI') displayName = 'Assistant Sub Inspector';
      else if (role === 'HC') displayName = 'Head Constable';
      else if (role === 'PC') displayName = 'Police Constable';
    }

    const accessModesStr = Array.isArray(accessModes) ? accessModes.join(',') : (accessModes || null);

    const newUser = await createStaffUser({ employeeId, name: displayName, role, password, zone, division, reportingStation, accessModes: accessModesStr });
    return res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    next(err);
  }
}

export async function deleteStaff(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }
    await deleteUserById(id);
    return res.json({ success: true, message: 'Staff user deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function impersonate(req, res, next) {
  try {
    const { employeeId } = req.body;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }
    const result = await impersonateUser({ employeeId });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const modes = user.access_modes ? user.access_modes.split(',').map(m => m.trim()) : [];
    const accessMode = req.user.accessMode || modes[0] || 'SB Control';
    
    return res.json({ 
      success: true, 
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        role: user.is_admin ? 'admin' : user.role,
        zone: user.zone,
        division: user.division,
        reporting_station: user.reporting_station,
        accessMode: accessMode
      }
    });
  } catch (err) {
    next(err);
  }
}
