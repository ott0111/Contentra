export type ReleasePlatform = 'web'|'windows'|'android'|'ios';

export function compareVersions(left: string, right: string) {
  const a=left.replace(/^v/,'').split(/[.-]/).map(x=>Number(x)||0), b=right.replace(/^v/,'').split(/[.-]/).map(x=>Number(x)||0);
  for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]??0)!==(b[i]??0))return (a[i]??0)>(b[i]??0)?1:-1;}
  return 0;
}

export function releaseForClient(release: {version:string;buildNumber:number|null;title:string;changelog:unknown;minimumSupportedVersion:string|null;platforms:unknown;publishedAt:Date|null}, platform: ReleasePlatform, currentVersion: string, buildNumber?: number) {
  const platforms=(release.platforms??{}) as Record<string, Record<string, unknown>>;
  const target=platforms[platform];
  if(!target || target.available===false) return null;
  const targetVersion=String(target.version??release.version);
  const targetBuild=typeof target.buildNumber==='number'?target.buildNumber:release.buildNumber;
  const updateAvailable=compareVersions(targetVersion,currentVersion)>0 || (targetVersion===currentVersion && targetBuild != null && buildNumber != null && targetBuild>buildNumber);
  const required=Boolean(release.minimumSupportedVersion && compareVersions(currentVersion,release.minimumSupportedVersion)<0);
  return {version:targetVersion,buildNumber:targetBuild,title:release.title,changelog:release.changelog,publishedAt:release.publishedAt,minimumSupportedVersion:release.minimumSupportedVersion,updateAvailable,required,update:target};
}
