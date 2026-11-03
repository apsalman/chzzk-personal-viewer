param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string]$Version = '0.2.0'
)
$ErrorActionPreference = 'Stop'
if (-not ('AzzztVersionResources' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class AzzztVersionResources {
    delegate bool LanguageCallback(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryExW(string file,IntPtr reserved,uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool EnumResourceLanguagesW(IntPtr module,IntPtr type,IntPtr name,LanguageCallback callback,IntPtr param);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr BeginUpdateResourceW(string file,bool deleteExisting);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateResourceW(IntPtr handle,IntPtr type,IntPtr name,ushort language,byte[] data,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResourceW(IntPtr handle,bool discard);
    static void Check(bool ok){if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
    static void Align(BinaryWriter writer){while(writer.BaseStream.Position%4!=0)writer.Write((byte)0);}
    static byte[] Block(string key,ushort type,byte[] value,ushort valueLength,params byte[][] children){
        using(var stream=new MemoryStream())using(var writer=new BinaryWriter(stream)){
            writer.Write((ushort)0);writer.Write(valueLength);writer.Write(type);
            writer.Write(Encoding.Unicode.GetBytes(key+"\0"));Align(writer);
            if(value!=null)writer.Write(value);
            foreach(var child in children){Align(writer);writer.Write(child);}
            long length=stream.Length;if(length>65535)throw new Exception("Version resource is too large");
            stream.Position=0;writer.Write((ushort)length);return stream.ToArray();
        }
    }
    static byte[] Text(string key,string value){return Block(key,1,Encoding.Unicode.GetBytes(value+"\0"),(ushort)(value.Length+1));}
    public static void Apply(string executable,string versionText){
        var version=new Version(versionText);string copyright=FileVersionInfo.GetVersionInfo(executable).LegalCopyright??"";
        byte[] fixedInfo;
        using(var stream=new MemoryStream())using(var writer=new BinaryWriter(stream)){
            uint high=((uint)version.Major<<16)|(uint)version.Minor,low=((uint)Math.Max(0,version.Build)<<16)|(uint)Math.Max(0,version.Revision);
            foreach(uint n in new uint[]{0xFEEF04BD,0x10000,high,low,high,low,0x3F,0,0x40004,1,0,0,0})writer.Write(n);
            fixedInfo=stream.ToArray();
        }
        byte[] strings=Block("StringFileInfo",1,null,0,Block("040904B0",1,null,0,
            Text("CompanyName","Azzzt"),Text("FileDescription","Azzzt \uC544\uC790\uC790\uC7A3"),Text("ProductName","Azzzt \uC544\uC790\uC790\uC7A3"),
            Text("InternalName","Azzzt"),Text("OriginalFilename","Azzzt.exe"),Text("FileVersion",versionText),
            Text("ProductVersion",versionText),Text("LegalCopyright",copyright)));
        byte[] translation=Block("VarFileInfo",1,null,0,Block("Translation",0,new byte[]{0x09,0x04,0xB0,0x04},4));
        byte[] resource=Block("VS_VERSION_INFO",0,fixedInfo,(ushort)fixedInfo.Length,strings,translation);
        var languages=new List<ushort>();IntPtr module=LoadLibraryExW(executable,IntPtr.Zero,2);if(module==IntPtr.Zero)Check(false);
        try{Check(EnumResourceLanguagesW(module,new IntPtr(16),new IntPtr(1),(m,t,n,l,p)=>{languages.Add(l);return true;},IntPtr.Zero));}finally{FreeLibrary(module);}
        IntPtr handle=BeginUpdateResourceW(executable,false);if(handle==IntPtr.Zero)Check(false);bool committed=false;
        try{foreach(ushort language in languages)Check(UpdateResourceW(handle,new IntPtr(16),new IntPtr(1),language,resource,(uint)resource.Length));Check(EndUpdateResourceW(handle,false));committed=true;}
        finally{if(!committed)EndUpdateResourceW(handle,true);}
    }
}
'@
}
[AzzztVersionResources]::Apply((Resolve-Path -LiteralPath $Executable).Path, $Version)
$info = [Diagnostics.FileVersionInfo]::GetVersionInfo((Resolve-Path -LiteralPath $Executable).Path)
$expectedName = [regex]::Unescape('Azzzt \uC544\uC790\uC790\uC7A3')
if ($info.ProductName -ne $expectedName -or $info.OriginalFilename -ne 'Azzzt.exe') { throw 'Application metadata verification failed' }
Write-Host 'Applied Azzzt application name and version metadata.'
