import './globals.css';
import './development-preview.css';
export const metadata={title:'Contentra — The Operating System for Creators',description:'Connect your business, see what matters, and know what to do next.'};
export default function RootLayout({children}:{children:React.ReactNode}){const preview=process.env.NODE_ENV==='development'&&process.env.NEXT_PUBLIC_DEVELOPMENT_PREVIEW==='1';return <html lang="en" className={preview?'development-preview-mode':undefined}><body>{children}{preview&&<span className="development-preview" style={{position:'fixed',right:14,top:14,zIndex:50,borderRadius:999,background:'#fff0e8',color:'#b94b12',padding:'5px 8px',fontSize:10,fontWeight:750,letterSpacing:'.04em',textTransform:'uppercase'}}>Development Preview</span>}</body></html>}
