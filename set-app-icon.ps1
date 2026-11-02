param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string]$Icon = (Join-Path $PSScriptRoot 'public\assets\app.ico')
)
$ErrorActionPreference = 'Stop'
if (-not ('ChzzkIconResources' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ChzzkIconResources {
    delegate bool NameCallback(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
    delegate bool LanguageCallback(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryExW(string file, IntPtr reserved, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool EnumResourceNamesW(IntPtr module, IntPtr type, NameCallback callback, IntPtr param);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool EnumResourceLanguagesW(IntPtr module, IntPtr type, IntPtr name, LanguageCallback callback, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResourceW(string file, bool deleteExisting);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateResourceW(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool EndUpdateResourceW(IntPtr handle, bool discard);
    static void Check(bool success) { if (!success) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
    public static void Apply(string executable, string icon) {
        byte[] ico = File.ReadAllBytes(icon);
        if (ico.Length < 6 || BitConverter.ToUInt16(ico,0)!=0 || BitConverter.ToUInt16(ico,2)!=1) throw new Exception("Invalid ICO file");
        int count = BitConverter.ToUInt16(ico,4);
        if(count==0 || ico.Length<6+16*count) throw new Exception("Empty or truncated ICO file");
        var names = new List<Tuple<string,ushort>>();
        IntPtr module = LoadLibraryExW(executable,IntPtr.Zero,2);
        if(module==IntPtr.Zero) Check(false);
        try {
            NameCallback callback = (m,t,n,p) => {
                string name = n.ToInt64()<=65535 ? "#"+n.ToInt64() : Marshal.PtrToStringUni(n);
                LanguageCallback language = (lm,lt,ln,l,lp) => { names.Add(Tuple.Create(name,l)); return true; };
                Check(EnumResourceLanguagesW(m,t,n,language,IntPtr.Zero)); return true;
            };
            EnumResourceNamesW(module,new IntPtr(14),callback,IntPtr.Zero);
        } finally { FreeLibrary(module); }
        if(names.Count==0) names.Add(Tuple.Create("#1",(ushort)0));
        byte[] group = new byte[6+14*count]; Array.Copy(ico,group,6);
        IntPtr handle = BeginUpdateResourceW(executable,false);
        if(handle==IntPtr.Zero) Check(false);
        bool committed=false;
        try {
            for(int i=0;i<count;i++) {
                int entry=6+i*16, size=checked((int)BitConverter.ToUInt32(ico,entry+8)), offset=checked((int)BitConverter.ToUInt32(ico,entry+12));
                if(offset<0 || size<0 || offset>ico.Length-size) throw new Exception("Invalid ICO image bounds");
                byte[] data=new byte[size]; Array.Copy(ico,offset,data,0,size);
                Array.Copy(ico,entry,group,6+i*14,12); Array.Copy(BitConverter.GetBytes((ushort)(100+i)),0,group,6+i*14+12,2);
                foreach(ushort language in new HashSet<ushort>(names.ConvertAll(n=>n.Item2)))
                    Check(UpdateResourceW(handle,new IntPtr(3),new IntPtr(100+i),language,data,(uint)data.Length));
            }
            foreach(var item in names) {
                bool numeric=item.Item1.StartsWith("#"); IntPtr name=numeric?new IntPtr(int.Parse(item.Item1.Substring(1))):Marshal.StringToHGlobalUni(item.Item1);
                try { Check(UpdateResourceW(handle,new IntPtr(14),name,item.Item2,group,(uint)group.Length)); }
                finally { if(!numeric) Marshal.FreeHGlobal(name); }
            }
            Check(EndUpdateResourceW(handle,false)); committed=true;
        } finally { if(!committed) EndUpdateResourceW(handle,true); }
    }
}
'@
}
[ChzzkIconResources]::Apply((Resolve-Path -LiteralPath $Executable).Path, (Resolve-Path -LiteralPath $Icon).Path)
Write-Host 'Applied application icon.'
