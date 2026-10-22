// Sets the exe icon and version info without needing Wine (pure JS resource editing).
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const name = context.packager.appInfo.productFilename + '.exe';
  const exePath = path.join(context.appOutDir, name);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = context.packager.appInfo.version.split('.').map(Number);
    vi.setFileVersion(v[0], v[1], v[2], 0, 1033);
    vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'Study Tracker', ProductName: 'Study Tracker', CompanyName: 'Study Tracker',
      InternalName: 'Study Tracker', OriginalFilename: name, LegalCopyright: '',
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • set icon and version info on', name);
};
