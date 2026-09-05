import crypto from 'crypto'

/**
 * Generate License Key For Client Verification
 * @returns {licenseKey}
 */
export function generateLicenseKey():string{
    const segMent = ()=>{
        return crypto.randomBytes(2).toString('hex').toUpperCase()
    }
    
    return `${segMent()}-${segMent()}-${segMent()}-${segMent()}`
}