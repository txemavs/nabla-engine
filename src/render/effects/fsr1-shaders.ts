// Adapted from AMD FidelityFX FSR 1 (FP32 EASU and RCAS), WebGL2 texel loads.
// https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h
/*!
Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files(the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions :
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */

export const easuShader = /* glsl */ `
uniform sampler2D inputTexture;
uniform vec2 inputSize;
out vec4 fragColor;
vec3 loadPixel(vec2 p) {
 return texelFetch(inputTexture, clamp(ivec2(p), ivec2(0), ivec2(inputSize)-1), 0).rgb;
}
uniform vec2 outputSize;
float APrxLoRcpF1(float v) { return 1.0/max(v,1e-8); }
float APrxLoRsqF1(float v) { return inversesqrt(max(v,1e-8)); }
float ARcpF1(float v) { return 1.0/max(v,1e-8); }
float ASatF1(float v) { return clamp(v,0.0,1.0); }
vec3 AMin3F3(vec3 a,vec3 b,vec3 c) { return min(a,min(b,c)); }
vec3 AMax3F3(vec3 a,vec3 b,vec3 c) { return max(a,max(b,c)); }
 void FsrEasuTapF(
 inout vec3 aC, 
 inout float aW, 
 vec2 off, 
 vec2 dir, 
 vec2 len, 
 float lob, 
 float clp, 
 vec3 c){ 
  vec2 v;
  v.x=(off.x*( dir.x))+(off.y*dir.y);
  v.y=(off.x*(-dir.y))+(off.y*dir.x);
  v*=len;
  float d2=v.x*v.x+v.y*v.y;
  d2=min(d2,clp);
  float wB=float(2.0/5.0)*d2+float(-1.0);
  float wA=lob*d2+float(-1.0);
  wB*=wB;
  wA*=wA;
  wB=float(25.0/16.0)*wB+float(-(25.0/16.0-1.0));
  float w=wB*wA;
  aC+=c*w;aW+=w;}
 void FsrEasuSetF(
 inout vec2 dir,
 inout float len,
 vec2 pp,
 bool biS,bool biT,bool biU,bool biV,
 float lA,float lB,float lC,float lD,float lE){
  float w = float(0.0);
  if(biS)w=(float(1.0)-pp.x)*(float(1.0)-pp.y);
  if(biT)w=           pp.x *(float(1.0)-pp.y);
  if(biU)w=(float(1.0)-pp.x)*           pp.y ;
  if(biV)w=           pp.x *           pp.y ;
  float dc=lD-lC;
  float cb=lC-lB;
  float lenX=max(abs(dc),abs(cb));
  lenX=APrxLoRcpF1(lenX);
  float dirX=lD-lB;
  dir.x+=dirX*w;
  lenX=ASatF1(abs(dirX)*lenX);
  lenX*=lenX;
  len+=lenX*w;
  float ec=lE-lC;
  float ca=lC-lA;
  float lenY=max(abs(ec),abs(ca));
  lenY=APrxLoRcpF1(lenY);
  float dirY=lE-lA;
  dir.y+=dirY*w;
  lenY=ASatF1(abs(dirY)*lenY);
  lenY*=lenY;
  len+=lenY*w;}
 void FsrEasuF(
 out vec3 pix,
 vec2 ip, 
 vec4 con0, 
 vec4 con1,
 vec4 con2,
 vec4 con3){
  vec2 pp=vec2(ip)*vec2(con0.xy)+vec2(con0.zw);
  vec2 fp=floor(pp);
  pp-=fp;
  vec3 b=loadPixel(fp+vec2(0,-1)), c=loadPixel(fp+vec2(1,-1));
  vec3 e=loadPixel(fp+vec2(-1,0)), f=loadPixel(fp), g=loadPixel(fp+vec2(1,0)), h=loadPixel(fp+vec2(2,0));
  vec3 i=loadPixel(fp+vec2(-1,1)), j=loadPixel(fp+vec2(0,1)), k=loadPixel(fp+vec2(1,1)), l=loadPixel(fp+vec2(2,1));
  vec3 n=loadPixel(fp+vec2(0,2)), o=loadPixel(fp+vec2(1,2));
  vec4 bczzR=vec4(b.r,c.r,0,0),bczzG=vec4(b.g,c.g,0,0),bczzB=vec4(b.b,c.b,0,0);
  vec4 ijfeR=vec4(i.r,j.r,f.r,e.r),ijfeG=vec4(i.g,j.g,f.g,e.g),ijfeB=vec4(i.b,j.b,f.b,e.b);
  vec4 klhgR=vec4(k.r,l.r,h.r,g.r),klhgG=vec4(k.g,l.g,h.g,g.g),klhgB=vec4(k.b,l.b,h.b,g.b);
  vec4 zzonR=vec4(0,0,o.r,n.r),zzonG=vec4(0,0,o.g,n.g),zzonB=vec4(0,0,o.b,n.b);
  vec4 bczzL=bczzB*vec4(0.5)+(bczzR*vec4(0.5)+bczzG);
  vec4 ijfeL=ijfeB*vec4(0.5)+(ijfeR*vec4(0.5)+ijfeG);
  vec4 klhgL=klhgB*vec4(0.5)+(klhgR*vec4(0.5)+klhgG);
  vec4 zzonL=zzonB*vec4(0.5)+(zzonR*vec4(0.5)+zzonG);
  float bL=bczzL.x;
  float cL=bczzL.y;
  float iL=ijfeL.x;
  float jL=ijfeL.y;
  float fL=ijfeL.z;
  float eL=ijfeL.w;
  float kL=klhgL.x;
  float lL=klhgL.y;
  float hL=klhgL.z;
  float gL=klhgL.w;
  float oL=zzonL.z;
  float nL=zzonL.w;
  vec2 dir=vec2(0.0);
  float len=float(0.0);
  FsrEasuSetF(dir,len,pp,true, false,false,false,bL,eL,fL,gL,jL);
  FsrEasuSetF(dir,len,pp,false,true ,false,false,cL,fL,gL,hL,kL);
  FsrEasuSetF(dir,len,pp,false,false,true ,false,fL,iL,jL,kL,nL);
  FsrEasuSetF(dir,len,pp,false,false,false,true ,gL,jL,kL,lL,oL);
  vec2 dir2=dir*dir;
  float dirR=dir2.x+dir2.y;
  bool zro=dirR<float(1.0/32768.0);
  dirR=APrxLoRsqF1(dirR);
  dirR=zro?float(1.0):dirR;
  dir.x=zro?float(1.0):dir.x;
  dir*=vec2(dirR);
  len=len*float(0.5);
  len*=len;
  float stretch=(dir.x*dir.x+dir.y*dir.y)*APrxLoRcpF1(max(abs(dir.x),abs(dir.y)));
  vec2 len2=vec2(float(1.0)+(stretch-float(1.0))*len,float(1.0)+float(-0.5)*len);
  float lob=float(0.5)+float((1.0/4.0-0.04)-0.5)*len;
  float clp=APrxLoRcpF1(lob);
  vec3 min4=min(AMin3F3(vec3(ijfeR.z,ijfeG.z,ijfeB.z),vec3(klhgR.w,klhgG.w,klhgB.w),vec3(ijfeR.y,ijfeG.y,ijfeB.y)),
               vec3(klhgR.x,klhgG.x,klhgB.x));
  vec3 max4=max(AMax3F3(vec3(ijfeR.z,ijfeG.z,ijfeB.z),vec3(klhgR.w,klhgG.w,klhgB.w),vec3(ijfeR.y,ijfeG.y,ijfeB.y)),
               vec3(klhgR.x,klhgG.x,klhgB.x));
  vec3 aC=vec3(0.0);
  float aW=float(0.0);
  FsrEasuTapF(aC,aW,vec2( 0.0,-1.0)-pp,dir,len2,lob,clp,vec3(bczzR.x,bczzG.x,bczzB.x)); 
  FsrEasuTapF(aC,aW,vec2( 1.0,-1.0)-pp,dir,len2,lob,clp,vec3(bczzR.y,bczzG.y,bczzB.y)); 
  FsrEasuTapF(aC,aW,vec2(-1.0, 1.0)-pp,dir,len2,lob,clp,vec3(ijfeR.x,ijfeG.x,ijfeB.x)); 
  FsrEasuTapF(aC,aW,vec2( 0.0, 1.0)-pp,dir,len2,lob,clp,vec3(ijfeR.y,ijfeG.y,ijfeB.y)); 
  FsrEasuTapF(aC,aW,vec2( 0.0, 0.0)-pp,dir,len2,lob,clp,vec3(ijfeR.z,ijfeG.z,ijfeB.z)); 
  FsrEasuTapF(aC,aW,vec2(-1.0, 0.0)-pp,dir,len2,lob,clp,vec3(ijfeR.w,ijfeG.w,ijfeB.w)); 
  FsrEasuTapF(aC,aW,vec2( 1.0, 1.0)-pp,dir,len2,lob,clp,vec3(klhgR.x,klhgG.x,klhgB.x)); 
  FsrEasuTapF(aC,aW,vec2( 2.0, 1.0)-pp,dir,len2,lob,clp,vec3(klhgR.y,klhgG.y,klhgB.y)); 
  FsrEasuTapF(aC,aW,vec2( 2.0, 0.0)-pp,dir,len2,lob,clp,vec3(klhgR.z,klhgG.z,klhgB.z)); 
  FsrEasuTapF(aC,aW,vec2( 1.0, 0.0)-pp,dir,len2,lob,clp,vec3(klhgR.w,klhgG.w,klhgB.w)); 
  FsrEasuTapF(aC,aW,vec2( 1.0, 2.0)-pp,dir,len2,lob,clp,vec3(zzonR.z,zzonG.z,zzonB.z)); 
  FsrEasuTapF(aC,aW,vec2( 0.0, 2.0)-pp,dir,len2,lob,clp,vec3(zzonR.w,zzonG.w,zzonB.w)); 
  pix=min(max4,max(min4,aC*vec3(ARcpF1(aW))));}

void main() {
 vec2 scale=inputSize/outputSize;
 vec3 colour;
 FsrEasuF(colour, floor(gl_FragCoord.xy), vec4(scale,0.5*scale-0.5),vec4(0),vec4(0),vec4(0));
 fragColor=vec4(colour,texture(inputTexture,gl_FragCoord.xy/outputSize).a);
}
`

export const rcasShader = /* glsl */ `
uniform sampler2D inputTexture;
uniform vec2 inputSize;
out vec4 fragColor;
vec3 loadPixel(vec2 p) {
 return texelFetch(inputTexture, clamp(ivec2(p), ivec2(0), ivec2(inputSize)-1), 0).rgb;
}
uniform float sharpness;
void main() {
 vec2 p=floor(gl_FragCoord.xy);
 vec3 b=loadPixel(p+vec2(0,-1)), d=loadPixel(p+vec2(-1,0));
 vec3 e=loadPixel(p), f=loadPixel(p+vec2(1,0)), h=loadPixel(p+vec2(0,1));
 vec3 mn=min(min(b,d),min(f,h)), mx=max(max(b,d),max(f,h));
 vec3 hitMin=min(mn,e)/max(4.0*mx,vec3(1e-8));
 vec3 hitMax=(vec3(1)-max(mx,e))/min(4.0*mn-4.0,vec3(-1e-8));
 vec3 lobes=max(-hitMin,hitMax);
 float lobe=max(-0.1875,min(max(lobes.r,max(lobes.g,lobes.b)),0.0))*sharpness;
 fragColor=vec4(clamp((lobe*(b+d+f+h)+e)/(4.0*lobe+1.0),0.0,1.0),texelFetch(inputTexture,ivec2(p),0).a);
}
`
