# --
# OTOBO is a web-based ticketing system for service organisations.
# --
# Copyright (C) 2019-2025 Rother OSS GmbH, https://otobo.io/
# --
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later version.
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
# --

package Kernel::GenericInterface::Operation::Customer::CustomerUserGet;

use strict;
use warnings;

use parent qw(
    Kernel::GenericInterface::Operation::Common
    Kernel::GenericInterface::Operation::Customer::Common
);

# OTOBO modules
use Kernel::System::VariableCheck qw(IsStringWithData);

our $ObjectManagerDisabled = 1;

=head1 NAME

Kernel::GenericInterface::Operation::Customer::CustomerUserGet - GenericInterface Customer User Get Operation backend

=head1 PUBLIC INTERFACE

=head2 new()

usually, you want to create an instance of this
by using Kernel::GenericInterface::Operation->new();

=cut

sub new {
    my ( $Type, %Param ) = @_;

    my $Self = {};
    bless( $Self, $Type );

    # check needed objects
    for my $Needed (qw(DebuggerObject WebserviceID)) {
        if ( !$Param{$Needed} ) {
            return {
                Success      => 0,
                ErrorMessage => "Got no $Needed!",
            };
        }

        $Self->{$Needed} = $Param{$Needed};
    }

    return $Self;
}

=head2 Run()

perform CustomerUserGet Operation. This will return customer user data for a single customer.

    my $Result = $OperationObject->Run(
        Data => {
            UserLogin         => 'some agent login',           # UserLogin or CustomerUserLogin or SessionID is required
            CustomerUserLogin => 'some customer login',
            SessionID         => 123,
            Password          => 'some password',              # if UserLogin or CustomerUserLogin is sent then Password is required

            User              => 'customer_user_login',        # required, the customer user login to retrieve
        },
    );

    $Result = {
        Success      => 1,                                     # 0 or 1
        ErrorMessage => '',                                    # In case of an error
        Data         => {
            UserLogin       => 'customer1',
            UserEmail       => 'customer1@example.com',
            UserCustomerID  => 'customer123',
            UserFirstname   => 'John',
            UserLastname    => 'Doe',
            UserFullname    => 'John Doe',
            UserTitle       => 'Mr',
            UserPhone       => '123-456-7890',
            UserMobile      => '098-765-4321',
            UserStreet      => '123 Main St',
            UserCity        => 'Anytown',
            UserZip         => '12345',
            UserCountry     => 'USA',
            UserComment     => 'Some comment',
            ValidID         => 1,
            ChangeTime      => '2025-01-01 12:00:00',
            CreateTime      => '2024-01-01 12:00:00',
        },
    };

=cut

sub Run {
    my ( $Self, %Param ) = @_;

    my $Result = $Self->Init(
        WebserviceID => $Self->{WebserviceID},
    );

    if ( !$Result->{Success} ) {
        return $Self->ReturnError(
            ErrorCode    => 'Webservice.InvalidConfiguration',
            ErrorMessage => $Result->{ErrorMessage},
        );
    }

    # Authenticate user
    my ( $UserID, $UserType ) = $Self->Auth(
        %Param,
    );

    return $Self->ReturnError(
        ErrorCode    => 'CustomerUserGet.AuthFail',
        ErrorMessage => "CustomerUserGet: Authorization failing!",
    ) if !$UserID;

    # Check required parameter
    if ( !$Param{Data}->{User} ) {
        return $Self->ReturnError(
            ErrorCode    => 'CustomerUserGet.MissingParameter',
            ErrorMessage => "CustomerUserGet: User parameter is required!",
        );
    }

    my $CustomerUserObject = $Kernel::OM->Get('Kernel::System::CustomerUser');
    
    # Get customer data
    my %CustomerData = $CustomerUserObject->CustomerUserDataGet(
        User => $Param{Data}->{User},
    );

    # Check if customer user exists
    if ( !%CustomerData ) {
        return $Self->ReturnError(
            ErrorCode    => 'CustomerUserGet.NotFound',
            ErrorMessage => "CustomerUserGet: Customer user not found!",
        );
    }

    # Return customer data
    return {
        Success => 1,
        Data    => \%CustomerData,
    };
}

1;

=head1 TERMS AND CONDITIONS

This software comes with ABSOLUTELY NO WARRANTY. For details, see
the enclosed file COPYING for license information (GPL). If you
did not receive this file, see L<https://www.gnu.org/licenses/gpl-3.0.txt>.

=cut
